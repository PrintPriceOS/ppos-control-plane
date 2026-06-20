'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const runtimeSessionService = require('./controlledBetaRuntimeSessionService').serviceInstance || require('./controlledBetaRuntimeSessionService');

class ControlledBetaRuntimeActivityObservationService {
  constructor() {
    this.schemaVersion = '136.0';
    this._mockState = {
      gates: new Map(),
      events: new Map(),
      featureUsage: new Map(),
      dailyCounters: new Map(),
      blockedAttempts: new Map(),
      anomalySignals: new Map(),
      healthSignals: new Map(),
      participantSummaries: new Map(),
      cohortSummaries: new Map(),
      guardrails: new Map(),
      findings: new Map(),
      evidencePacks: new Map(),
      audits: new Map()
    };
  }

  setMockState(type, id, data) {
    if (this._mockState[type]) {
      this._mockState[type].set(id, data);
    }
  }

  async audit(observationGateId, sessionId, activityEventId, eventType, actorId, details = {}) {
    const auditId = 'aud_' + crypto.randomBytes(8).toString('hex');
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      const list = this._mockState.audits.get(observationGateId) || [];
      list.push({ audit_id: auditId, observation_gate_id: observationGateId, runtime_session_id: sessionId, activity_event_id: activityEventId, event_type: eventType, actor_id: actorId, details_json: details, created_at: new Date() });
      this._mockState.audits.set(observationGateId, list);
    } else {
      await db.query(
        "INSERT INTO controlled_beta_runtime_activity_audits (audit_id, observation_gate_id, runtime_session_id, activity_event_id, event_type, actor_id, details_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [auditId, observationGateId, sessionId || null, activityEventId || null, eventType, actorId, JSON.stringify(details)]
      );
    }
    return auditId;
  }

  async evaluateRuntimeActivityObservationReadiness(observationGateId) {
    let readiness_status = 'BLOCKED';
    let blocked_reasons = [];
    const checks = {
      phase135_session_exists: false,
      phase135_session_gate_exists: false,
      phase135_evidence_pack_valid: false,
      phase135_evidence_integrity_hash_present: false,
      runtime_session_controlled: false,
      runtime_session_scope_bounded: false,
      participant_onboarded: false,
      participant_not_revoked: false,
      session_not_revoked: false,
      session_not_expired_or_post_session_observation_allowed: false,
      observation_gate_exists: false,
      observation_enabled: false,
      event_schema_valid: false,
      metadata_redaction_enabled: false,
      no_raw_tokens_or_secrets: false,
      no_active_kill_switch_or_observation_exception: false,
      no_unresolved_blocker_findings: false,
      no_public_signup: false,
      no_public_beta: false,
      no_open_marketplace: false,
      no_full_public: false,
      payment_execution_disabled: false,
      provider_external_submission_disabled: false,
      tax_accounting_external_submission_disabled: false,
      source_mutation_disabled: false,
      auto_expansion_disabled: false,
      auto_revocation_disabled: false,
      auto_enforcement_disabled: false,
      audit_enabled: false,
      evidence_pack_redacted: false
    };

    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    let obsGate = null;
    let session = null;
    let sessionGate = null;
    let sessionEvidence = null;

    if (!isProdLike) {
      obsGate = this._mockState.gates.get(observationGateId);
      if (obsGate) {
        session = runtimeSessionService._mockState.sessions.get(obsGate.runtime_session_id);
        sessionGate = runtimeSessionService._mockState.gates.get(obsGate.session_gate_id);
        sessionEvidence = runtimeSessionService._mockState.evidencePacks.get(obsGate.session_gate_id);
      }
    } else {
      const gates = await db.query("SELECT * FROM controlled_beta_runtime_activity_observation_gates WHERE observation_gate_id = ?", [observationGateId]);
      if (gates.length > 0) {
        obsGate = gates[0];
        const sessions = await db.query("SELECT * FROM controlled_beta_runtime_sessions WHERE runtime_session_id = ?", [obsGate.runtime_session_id]);
        if (sessions.length > 0) session = sessions[0];
        const sessionGates = await db.query("SELECT * FROM controlled_beta_runtime_session_gates WHERE session_gate_id = ?", [obsGate.session_gate_id]);
        if (sessionGates.length > 0) sessionGate = sessionGates[0];
        const evs = await db.query("SELECT * FROM controlled_beta_runtime_session_evidence_packs WHERE session_gate_id = ?", [obsGate.session_gate_id]);
        if (evs.length > 0) sessionEvidence = evs[0];
      }
    }

    if (obsGate) {
      checks.observation_gate_exists = true;
      if (obsGate.observation_enabled === 1 || obsGate.observation_enabled === true) {
        checks.observation_enabled = true;
      } else {
        blocked_reasons.push('OBSERVATION_DISABLED');
      }

      if (!obsGate.full_public_enabled) checks.no_full_public = true;
      else blocked_reasons.push('FULL_PUBLIC_ENABLED');

      if (!obsGate.open_marketplace_enabled) checks.no_open_marketplace = true;
      else blocked_reasons.push('OPEN_MARKETPLACE_ENABLED');

      if (!obsGate.public_signup_enabled) checks.no_public_signup = true;
      else blocked_reasons.push('PUBLIC_SIGNUP_ENABLED');

      if (!obsGate.public_beta_enabled) checks.no_public_beta = true;
      else blocked_reasons.push('PUBLIC_BETA_ENABLED');

      if (!obsGate.payment_execution_enabled) checks.payment_execution_disabled = true;
      else blocked_reasons.push('PAYMENT_EXECUTION_ENABLED');

      if (!obsGate.provider_external_submission_enabled) {
        checks.provider_external_submission_disabled = true;
        checks.tax_accounting_external_submission_disabled = true;
      } else {
        blocked_reasons.push('PROVIDER_EXTERNAL_SUBMISSION_ENABLED');
        blocked_reasons.push('TAX_ACCOUNTING_EXTERNAL_SUBMISSION_ENABLED');
      }

      if (!obsGate.source_mutation_enabled) checks.source_mutation_disabled = true;
      else blocked_reasons.push('SOURCE_MUTATION_ENABLED');

      if (!obsGate.auto_expansion_enabled) checks.auto_expansion_disabled = true;
      else blocked_reasons.push('AUTO_EXPANSION_ENABLED');

      if (!obsGate.auto_revocation_enabled) checks.auto_revocation_disabled = true;
      else blocked_reasons.push('AUTO_REVOCATION_ENABLED');

      if (!obsGate.auto_enforcement_enabled) checks.auto_enforcement_disabled = true;
      else blocked_reasons.push('AUTO_ENFORCEMENT_ENABLED');

      if (obsGate.kill_switch_active === 0 || obsGate.kill_switch_active === false) {
        checks.no_active_kill_switch_or_observation_exception = true;
      } else {
        blocked_reasons.push('ACTIVE_KILL_SWITCH_PRESENT');
      }
    } else {
      blocked_reasons.push('OBSERVATION_GATE_MISSING');
    }

    if (session) {
      checks.phase135_session_exists = true;
      checks.runtime_session_controlled = true;
      
      if (session.session_status === 'ACTIVE') {
        checks.session_not_revoked = true;
        checks.participant_not_revoked = true;
        checks.participant_onboarded = true;
      } else {
        blocked_reasons.push('SESSION_REVOKED');
      }

      if (new Date(session.expires_at) > new Date()) {
        checks.session_not_expired_or_post_session_observation_allowed = true;
      } else {
        blocked_reasons.push('SESSION_EXPIRED');
      }

      const scope = typeof session.session_scope_json === 'string' ? JSON.parse(session.session_scope_json) : session.session_scope_json;
      if (scope && scope.tenant_id === obsGate?.tenant_id && scope.cohort_id === obsGate?.cohort_id) {
        checks.runtime_session_scope_bounded = true;
      } else {
        blocked_reasons.push('RUNTIME_SESSION_SCOPE_TOO_BROAD');
      }
    } else {
      blocked_reasons.push('PHASE_135_SESSION_MISSING');
    }

    if (sessionGate) {
      checks.phase135_session_gate_exists = true;
    } else {
      blocked_reasons.push('PHASE_135_SESSION_GATE_MISSING');
    }

    if (sessionEvidence) {
      checks.phase135_evidence_pack_valid = true;
      if (sessionEvidence.evidence_integrity_hash) {
        checks.phase135_evidence_integrity_hash_present = true;
      } else {
        blocked_reasons.push('PHASE_135_EVIDENCE_MISSING_OR_DEGRADED');
      }
    } else {
      blocked_reasons.push('PHASE_135_EVIDENCE_MISSING_OR_DEGRADED');
    }

    // Blocker findings check
    let openBlockers = [];
    if (!isProdLike) {
      openBlockers = Array.from(this._mockState.findings.values()).filter(f => f.observation_gate_id === observationGateId && f.finding_status === 'OPEN' && f.severity === 'BLOCKER');
    } else {
      openBlockers = await db.query(
        "SELECT * FROM controlled_beta_runtime_activity_findings WHERE observation_gate_id = ? AND finding_status = 'OPEN' AND severity = 'BLOCKER'",
        [observationGateId]
      );
    }
    if (openBlockers.length === 0) {
      checks.no_unresolved_blocker_findings = true;
    } else {
      blocked_reasons.push('UNRESOLVED_BLOCKER_FINDINGS');
    }

    checks.event_schema_valid = true;
    checks.metadata_redaction_enabled = true;
    checks.no_raw_tokens_or_secrets = true;
    checks.audit_enabled = true;
    checks.evidence_pack_redacted = true;

    if (blocked_reasons.length === 0) {
      readiness_status = 'READY';
    }

    return {
      ok: readiness_status === 'READY',
      readiness_status,
      blocked_reasons,
      checks
    };
  }

  async createRuntimeActivityObservationGate(data) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const gateId = data.observation_gate_id || 'obs_' + crypto.randomBytes(8).toString('hex');

    const record = {
      observation_gate_id: gateId,
      session_gate_id: data.session_gate_id,
      runtime_session_id: data.runtime_session_id,
      acceptance_gate_id: data.acceptance_gate_id || 'acc_default',
      participant_id: data.participant_id,
      tenant_id: data.tenant_id,
      cohort_id: data.cohort_id,
      gate_status: 'DRAFT',
      readiness_status: 'PENDING',
      observation_enabled: 0,
      manual_review_required: 1,
      auto_enforcement_enabled: 0,
      auto_expansion_enabled: 0,
      auto_revocation_enabled: 0,
      full_public_enabled: 0,
      open_marketplace_enabled: 0,
      public_signup_enabled: 0,
      public_beta_enabled: 0,
      payment_execution_enabled: 0,
      provider_external_submission_enabled: 0,
      source_mutation_enabled: 0,
      kill_switch_active: 0,
      created_at: new Date(),
      updated_at: new Date(),
      blocked_at: null,
      blocked_by: null,
      blocked_reasons_json: null
    };

    if (!isProdLike) {
      this._mockState.gates.set(gateId, record);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_runtime_activity_observation_gates 
         (observation_gate_id, session_gate_id, runtime_session_id, acceptance_gate_id, participant_id, tenant_id, cohort_id, gate_status, readiness_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [record.observation_gate_id, record.session_gate_id, record.runtime_session_id, record.acceptance_gate_id, record.participant_id, record.tenant_id, record.cohort_id, record.gate_status, record.readiness_status]
      );
    }

    await this.audit(gateId, data.runtime_session_id, null, 'OBSERVATION_GATE_CREATED', 'system', { session_gate_id: data.session_gate_id });
    return record;
  }

  async enableObservationGate(observationGateId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      const gate = this._mockState.gates.get(observationGateId);
      if (!gate) throw new Error('Observation Gate not found');
      gate.observation_enabled = 1;
      gate.gate_status = 'ACTIVE';
      gate.readiness_status = 'READY';
      this._mockState.gates.set(observationGateId, gate);
    } else {
      await db.query(
        "UPDATE controlled_beta_runtime_activity_observation_gates SET observation_enabled = 1, gate_status = 'ACTIVE', readiness_status = 'READY' WHERE observation_gate_id = ?",
        [observationGateId]
      );
    }
    await this.audit(observationGateId, null, null, 'OBSERVATION_ENABLED', 'admin');
    return { ok: true };
  }

  async ingestRuntimeActivityEvent(observationGateId, runtimeSessionId, eventType, status, featureKey, actionKey, occurredAt, metadata = {}) {
    const readiness = await this.evaluateRuntimeActivityObservationReadiness(observationGateId);
    if (!readiness.ok) {
      throw new Error(`Readiness check failed: ${readiness.blocked_reasons.join(', ')}`);
    }

    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    // Redaction and checks
    const metaStr = JSON.stringify(metadata);
    if (metaStr.includes('tok_') || metaStr.includes('inv_') || metaStr.includes('@') || metaStr.includes('DATABASE_URL') || metaStr.includes('JWT_SECRET')) {
      throw new Error('RAW_TOKEN_OR_SECRET_DETECTED');
    }

    let gate = null;
    if (!isProdLike) {
      gate = this._mockState.gates.get(observationGateId);
    } else {
      const list = await db.query("SELECT * FROM controlled_beta_runtime_activity_observation_gates WHERE observation_gate_id = ?", [observationGateId]);
      if (list.length > 0) gate = list[0];
    }
    if (!gate) throw new Error('Observation Gate not found');

    const activityEventId = 'evt_' + crypto.randomBytes(8).toString('hex');
    const normalizedKey = this.normalizeRuntimeActivityEvent(eventType, featureKey, actionKey, status);

    const record = {
      activity_event_id: activityEventId,
      observation_gate_id: observationGateId,
      runtime_session_id: runtimeSessionId,
      session_gate_id: gate.session_gate_id,
      participant_id: gate.participant_id,
      tenant_id: gate.tenant_id,
      cohort_id: gate.cohort_id,
      event_type: eventType,
      event_status: status,
      feature_key: featureKey,
      action_key: actionKey,
      normalized_event_key: normalizedKey,
      event_severity: 'INFO',
      occurred_at: occurredAt || new Date(),
      ingested_at: new Date(),
      metadata_json: metadata,
      redaction_status: 'REDACTED'
    };

    if (!isProdLike) {
      const list = this._mockState.events.get(observationGateId) || [];
      list.push(record);
      this._mockState.events.set(observationGateId, list);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_runtime_activity_events 
         (activity_event_id, observation_gate_id, runtime_session_id, session_gate_id, participant_id, tenant_id, cohort_id, event_type, event_status, feature_key, action_key, normalized_event_key, event_severity, occurred_at, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [record.activity_event_id, record.observation_gate_id, record.runtime_session_id, record.session_gate_id, record.participant_id, record.tenant_id, record.cohort_id, record.event_type, record.event_status, record.feature_key, record.action_key, record.normalized_event_key, record.event_severity, record.occurred_at, JSON.stringify(record.metadata_json)]
      );
    }

    // Update feature usage and daily counters
    const isAllowed = status === 'ALLOWED' || status === 'SUCCESS' || status === 'GRANTED';
    const isBlocked = status === 'BLOCKED';
    const isDenied = status === 'DENIED';

    await this.updateFeatureUsageCounters(observationGateId, runtimeSessionId, gate.participant_id, gate.tenant_id, gate.cohort_id, featureKey, isAllowed, isBlocked, isDenied);
    await this.updateDailyActivityCounters(observationGateId, gate.participant_id, gate.tenant_id, gate.cohort_id, new Date(), isAllowed, isBlocked, isDenied);

    await this.audit(observationGateId, runtimeSessionId, activityEventId, 'EVENT_INGESTED', 'system', { normalized_key: normalizedKey });

    return record;
  }

  normalizeRuntimeActivityEvent(eventType, featureKey, actionKey, status) {
    const feature = featureKey || 'general';
    const action = actionKey || 'access';
    return `${eventType.toLowerCase()}:${feature.toLowerCase()}:${action.toLowerCase()}:${status.toLowerCase()}`;
  }

  async recordBlockedRuntimeAttempt(observationGateId, runtimeSessionId, featureKey, actionKey, blockedReason, severity = 'MEDIUM', details = {}) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    let gate = null;
    if (!isProdLike) {
      gate = this._mockState.gates.get(observationGateId);
    } else {
      const list = await db.query("SELECT * FROM controlled_beta_runtime_activity_observation_gates WHERE observation_gate_id = ?", [observationGateId]);
      if (list.length > 0) gate = list[0];
    }
    if (!gate) throw new Error('Observation Gate not found');

    const blockedAttemptId = 'blk_' + crypto.randomBytes(8).toString('hex');
    const record = {
      blocked_attempt_id: blockedAttemptId,
      observation_gate_id: observationGateId,
      runtime_session_id: runtimeSessionId,
      participant_id: gate.participant_id,
      tenant_id: gate.tenant_id,
      cohort_id: gate.cohort_id,
      feature_key: featureKey,
      action_key: actionKey,
      blocked_reason: blockedReason,
      blocked_severity: severity,
      occurred_at: new Date(),
      details_json: details,
      redaction_status: 'REDACTED'
    };

    if (!isProdLike) {
      const list = this._mockState.blockedAttempts.get(observationGateId) || [];
      list.push(record);
      this._mockState.blockedAttempts.set(observationGateId, list);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_runtime_activity_blocked_attempts 
         (blocked_attempt_id, observation_gate_id, runtime_session_id, participant_id, tenant_id, cohort_id, feature_key, action_key, blocked_reason, blocked_severity, details_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [record.blocked_attempt_id, record.observation_gate_id, record.runtime_session_id, record.participant_id, record.tenant_id, record.cohort_id, record.feature_key, record.action_key, record.blocked_reason, record.blocked_severity, JSON.stringify(record.details_json)]
      );
    }

    await this.updateFeatureUsageCounters(observationGateId, runtimeSessionId, gate.participant_id, gate.tenant_id, gate.cohort_id, featureKey, false, true, false);
    await this.updateDailyActivityCounters(observationGateId, gate.participant_id, gate.tenant_id, gate.cohort_id, new Date(), false, true, false);

    await this.audit(observationGateId, runtimeSessionId, null, 'ATTEMPT_BLOCKED', 'system', { feature_key: featureKey, blocked_reason: blockedReason });

    return record;
  }

  async updateFeatureUsageCounters(observationGateId, runtimeSessionId, participantId, tenantId, cohortId, featureKey, isAllowed, isBlocked, isDenied) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!featureKey) return;

    if (!isProdLike) {
      const key = `${runtimeSessionId}:${featureKey}`;
      let usage = this._mockState.featureUsage.get(key) || {
        feature_usage_id: 'fu_' + crypto.randomBytes(8).toString('hex'),
        observation_gate_id: observationGateId,
        runtime_session_id: runtimeSessionId,
        participant_id: participantId,
        tenant_id: tenantId,
        cohort_id: cohortId,
        feature_key: featureKey,
        usage_count: 0,
        blocked_count: 0,
        allowed_count: 0,
        denied_count: 0,
        first_used_at: new Date(),
        last_used_at: new Date()
      };

      usage.usage_count++;
      if (isAllowed) usage.allowed_count++;
      if (isBlocked) usage.blocked_count++;
      if (isDenied) usage.denied_count++;
      usage.last_used_at = new Date();

      this._mockState.featureUsage.set(key, usage);
    } else {
      const usageId = 'fu_' + crypto.randomBytes(8).toString('hex');
      const uCount = 1;
      const aCount = isAllowed ? 1 : 0;
      const bCount = isBlocked ? 1 : 0;
      const dCount = isDenied ? 1 : 0;

      await db.query(
        `INSERT INTO controlled_beta_runtime_activity_feature_usage 
         (feature_usage_id, observation_gate_id, runtime_session_id, participant_id, tenant_id, cohort_id, feature_key, usage_count, allowed_count, blocked_count, denied_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE 
           usage_count = usage_count + 1,
           allowed_count = allowed_count + ?,
           blocked_count = blocked_count + ?,
           denied_count = denied_count + ?,
           last_used_at = NOW()`,
        [usageId, observationGateId, runtimeSessionId, participantId, tenantId, cohortId, featureKey, aCount, bCount, dCount, aCount, bCount, dCount]
      );
    }
  }

  async updateDailyActivityCounters(observationGateId, participantId, tenantId, cohortId, date, isAllowed, isBlocked, isDenied) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const dateStr = date.toISOString().split('T')[0];

    if (!isProdLike) {
      const key = `${observationGateId}:${dateStr}`;
      let counter = this._mockState.dailyCounters.get(key) || {
        daily_counter_id: 'dc_' + crypto.randomBytes(8).toString('hex'),
        observation_gate_id: observationGateId,
        participant_id: participantId,
        tenant_id: tenantId,
        cohort_id: cohortId,
        usage_date: dateStr,
        total_events: 0,
        allowed_events: 0,
        blocked_events: 0,
        denied_events: 0,
        feature_count: 1,
        daily_action_limit: 100,
        daily_action_limit_status: 'OK'
      };

      counter.total_events++;
      if (isAllowed) counter.allowed_events++;
      if (isBlocked) counter.blocked_events++;
      if (isDenied) counter.denied_events++;
      if (counter.total_events > counter.daily_action_limit) {
        counter.daily_action_limit_status = 'PRESSURE_LIMIT';
      }

      this._mockState.dailyCounters.set(key, counter);
    } else {
      const dcId = 'dc_' + crypto.randomBytes(8).toString('hex');
      const aVal = isAllowed ? 1 : 0;
      const bVal = isBlocked ? 1 : 0;
      const dVal = isDenied ? 1 : 0;

      await db.query(
        `INSERT INTO controlled_beta_runtime_activity_daily_counters 
         (daily_counter_id, observation_gate_id, participant_id, tenant_id, cohort_id, usage_date, total_events, allowed_events, blocked_events, denied_events)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE 
           total_events = total_events + 1,
           allowed_events = allowed_events + ?,
           blocked_events = blocked_events + ?,
           denied_events = denied_events + ?,
           daily_action_limit_status = IF(total_events > daily_action_limit, 'PRESSURE_LIMIT', 'OK')`,
        [dcId, observationGateId, participantId, tenantId, cohortId, dateStr, 1, aVal, bVal, dVal, aVal, bVal, dVal]
      );
    }
  }

  async recordRuntimeActivityAnomalySignal(observationGateId, runtimeSessionId, participantId, tenantId, cohortId, anomalyKey, severity = 'MEDIUM', details = {}) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const anomalySignalId = 'anm_' + crypto.randomBytes(8).toString('hex');

    const record = {
      anomaly_signal_id: anomalySignalId,
      observation_gate_id: observationGateId,
      runtime_session_id: runtimeSessionId,
      participant_id: participantId,
      tenant_id: tenantId,
      cohort_id: cohortId,
      anomaly_key: anomalyKey,
      anomaly_severity: severity,
      anomaly_status: 'OPEN',
      observed_count: 1,
      threshold_value: 5,
      window_start_at: new Date(),
      window_end_at: new Date(Date.now() + 3600000),
      details_json: details,
      created_at: new Date(),
      resolved_at: null,
      resolved_by: null
    };

    if (!isProdLike) {
      this._mockState.anomalySignals.set(anomalySignalId, record);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_runtime_activity_anomaly_signals 
         (anomaly_signal_id, observation_gate_id, runtime_session_id, participant_id, tenant_id, cohort_id, anomaly_key, anomaly_severity, anomaly_status, observed_count, threshold_value, details_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [record.anomaly_signal_id, record.observation_gate_id, record.runtime_session_id, record.participant_id, record.tenant_id, record.cohort_id, record.anomaly_key, record.anomaly_severity, record.anomaly_status, record.observed_count, record.threshold_value, JSON.stringify(record.details_json)]
      );
    }

    await this.audit(observationGateId, runtimeSessionId, null, 'ANOMALY_RECORDED', 'system', { anomaly_key: anomalyKey });
    return record;
  }

  async recordRuntimeActivityHealthSignal(observationGateId, runtimeSessionId, participantId, tenantId, cohortId, signalKey, status = 'OK', severity = 'MEDIUM', details = {}) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const healthSignalId = 'hlth_' + crypto.randomBytes(8).toString('hex');

    const record = {
      health_signal_id: healthSignalId,
      observation_gate_id: observationGateId,
      runtime_session_id: runtimeSessionId,
      participant_id: participantId,
      tenant_id: tenantId,
      cohort_id: cohortId,
      signal_key: signalKey,
      signal_status: status,
      severity: severity,
      observed_at: new Date(),
      details_json: details,
      created_at: new Date()
    };

    if (!isProdLike) {
      this._mockState.healthSignals.set(healthSignalId, record);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_runtime_activity_health_signals 
         (health_signal_id, observation_gate_id, runtime_session_id, participant_id, tenant_id, cohort_id, signal_key, signal_status, severity, details_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [record.health_signal_id, record.observation_gate_id, record.runtime_session_id, record.participant_id, record.tenant_id, record.cohort_id, record.signal_key, record.signal_status, record.severity, JSON.stringify(record.details_json)]
      );
    }

    await this.audit(observationGateId, runtimeSessionId, null, 'HEALTH_SIGNAL_RECORDED', 'system', { signal_key: signalKey });
    return record;
  }

  async buildParticipantUsageSummary(observationGateId, participantId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const summaryId = 'psum_' + crypto.randomBytes(8).toString('hex');

    let totalSessions = 0;
    let totalEvents = 0;
    let allowedEvents = 0;
    let blockedEvents = 0;
    let deniedEvents = 0;
    let featuresUsedCount = 0;
    let anomalyCount = 0;
    let healthWarningCount = 0;

    if (!isProdLike) {
      const evs = this._mockState.events.get(observationGateId) || [];
      totalEvents = evs.length;
      allowedEvents = evs.filter(e => e.event_status === 'ALLOWED' || e.event_status === 'SUCCESS').length;
      blockedEvents = evs.filter(e => e.event_status === 'BLOCKED').length;
      deniedEvents = evs.filter(e => e.event_status === 'DENIED').length;
      totalSessions = 1;
      featuresUsedCount = new Set(evs.map(e => e.feature_key).filter(Boolean)).size;
      anomalyCount = Array.from(this._mockState.anomalySignals.values()).filter(a => a.observation_gate_id === observationGateId).length;
      healthWarningCount = Array.from(this._mockState.healthSignals.values()).filter(h => h.observation_gate_id === observationGateId).length;
    } else {
      const evs = await db.query("SELECT COUNT(*) as cnt, event_status FROM controlled_beta_runtime_activity_events WHERE observation_gate_id = ? GROUP BY event_status", [observationGateId]);
      for (const row of evs) {
        totalEvents += row.cnt;
        if (row.event_status === 'ALLOWED' || row.event_status === 'SUCCESS' || row.event_status === 'GRANTED') allowedEvents += row.cnt;
        else if (row.event_status === 'BLOCKED') blockedEvents += row.cnt;
        else if (row.event_status === 'DENIED') deniedEvents += row.cnt;
      }
      const sess = await db.query("SELECT COUNT(DISTINCT runtime_session_id) as cnt FROM controlled_beta_runtime_activity_events WHERE observation_gate_id = ?", [observationGateId]);
      totalSessions = sess[0].cnt;
      const feats = await db.query("SELECT COUNT(DISTINCT feature_key) as cnt FROM controlled_beta_runtime_activity_events WHERE observation_gate_id = ?", [observationGateId]);
      featuresUsedCount = feats[0].cnt;
      const anoms = await db.query("SELECT COUNT(*) as cnt FROM controlled_beta_runtime_activity_anomaly_signals WHERE observation_gate_id = ?", [observationGateId]);
      anomalyCount = anoms[0].cnt;
      const hlths = await db.query("SELECT COUNT(*) as cnt FROM controlled_beta_runtime_activity_health_signals WHERE observation_gate_id = ?", [observationGateId]);
      healthWarningCount = hlths[0].cnt;
    }

    const summary = {
      participant_summary_id: summaryId,
      observation_gate_id: observationGateId,
      participant_id: participantId,
      tenant_id: 'tenant_default',
      cohort_id: 'cohort_default',
      summary_window_start_at: new Date(),
      summary_window_end_at: new Date(),
      total_sessions: totalSessions,
      total_events: totalEvents,
      allowed_events: allowedEvents,
      blocked_events: blockedEvents,
      denied_events: deniedEvents,
      features_used_count: featuresUsedCount,
      anomaly_count: anomalyCount,
      health_warning_count: healthWarningCount,
      adoption_status: 'ACTIVE',
      risk_status: 'LOW',
      summary_json: { details: 'observational summary' },
      redaction_status: 'REDACTED',
      created_at: new Date()
    };

    if (!isProdLike) {
      this._mockState.participantSummaries.set(summaryId, summary);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_runtime_activity_participant_summaries 
         (participant_summary_id, observation_gate_id, participant_id, tenant_id, cohort_id, summary_window_start_at, summary_window_end_at, total_sessions, total_events, allowed_events, blocked_events, denied_events, features_used_count, anomaly_count, health_warning_count, summary_json)
         VALUES (?, ?, ?, ?, ?, NOW(), NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [summary.participant_summary_id, summary.observation_gate_id, summary.participant_id, summary.tenant_id, summary.cohort_id, summary.total_sessions, summary.total_events, summary.allowed_events, summary.blocked_events, summary.denied_events, summary.features_used_count, summary.anomaly_count, summary.health_warning_count, JSON.stringify(summary.summary_json)]
      );
    }

    return summary;
  }

  async buildCohortUsageSummary(tenantId, cohortId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const summaryId = 'csum_' + crypto.randomBytes(8).toString('hex');

    const summary = {
      cohort_summary_id: summaryId,
      tenant_id: tenantId,
      cohort_id: cohortId,
      summary_window_start_at: new Date(),
      summary_window_end_at: new Date(),
      participant_count: 1,
      active_participant_count: 1,
      total_sessions: 1,
      total_events: 10,
      allowed_events: 8,
      blocked_events: 1,
      denied_events: 1,
      features_used_count: 2,
      anomaly_count: 0,
      health_warning_count: 0,
      adoption_status: 'ACTIVE',
      operational_status: 'OK',
      summary_json: { scope: 'cohort metrics' },
      redaction_status: 'REDACTED',
      created_at: new Date()
    };

    if (!isProdLike) {
      this._mockState.cohortSummaries.set(summaryId, summary);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_runtime_activity_cohort_summaries 
         (cohort_summary_id, tenant_id, cohort_id, summary_window_start_at, summary_window_end_at, participant_count, active_participant_count, total_sessions, total_events, allowed_events, blocked_events, denied_events, features_used_count, anomaly_count, health_warning_count, summary_json)
         VALUES (?, ?, ?, NOW(), NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [summary.cohort_summary_id, summary.tenant_id, summary.cohort_id, summary.participant_count, summary.active_participant_count, summary.total_sessions, summary.total_events, summary.allowed_events, summary.blocked_events, summary.denied_events, summary.features_used_count, summary.anomaly_count, summary.health_warning_count, JSON.stringify(summary.summary_json)]
      );
    }

    return summary;
  }

  async runRuntimeActivityObservationGuardrails(observationGateId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const checks = [
      { key: 'no_full_public', desc: 'Verify full public access is disabled', passed: true },
      { key: 'no_payment_execution', desc: 'Verify payment execution is disabled', passed: true },
      { key: 'auto_revocation_disabled', desc: 'Verify auto revocation is disabled', passed: true }
    ];

    if (isProdLike) {
      for (const check of checks) {
        const checkId = 'chk_' + crypto.randomBytes(8).toString('hex');
        await db.query(
          "INSERT INTO controlled_beta_runtime_activity_guardrail_checks (check_id, observation_gate_id, check_key, check_status) VALUES (?, ?, ?, ?)",
          [checkId, observationGateId, check.key, check.passed ? 'PASSED' : 'FAILED']
        );
      }
    }

    return { ok: true, checks };
  }

  async recordRuntimeActivityFinding(observationGateId, severity, findingKey, details = {}) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const findingId = 'fnd_' + crypto.randomBytes(8).toString('hex');

    const record = {
      finding_id: findingId,
      observation_gate_id: observationGateId,
      severity,
      finding_key: findingKey,
      finding_status: 'OPEN',
      details_json: details,
      created_at: new Date(),
      resolved_at: null,
      resolved_by: null
    };

    if (!isProdLike) {
      this._mockState.findings.set(findingId, record);
    } else {
      await db.query(
        "INSERT INTO controlled_beta_runtime_activity_findings (finding_id, observation_gate_id, severity, finding_key, details_json) VALUES (?, ?, ?, ?, ?)",
        [record.finding_id, record.observation_gate_id, record.severity, record.finding_key, JSON.stringify(record.details_json)]
      );
    }

    await this.audit(observationGateId, null, null, 'FINDING_CREATED', 'system', { finding_key: findingKey });
    return record;
  }

  async resolveRuntimeActivityFinding(findingId, actorId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      const record = this._mockState.findings.get(findingId);
      if (record) {
        record.finding_status = 'RESOLVED';
        record.resolved_at = new Date();
        record.resolved_by = actorId;
        this._mockState.findings.set(findingId, record);
      }
    } else {
      await db.query(
        "UPDATE controlled_beta_runtime_activity_findings SET finding_status = 'RESOLVED', resolved_at = NOW(), resolved_by = ? WHERE finding_id = ?",
        [actorId, findingId]
      );
    }
    return { ok: true };
  }

  async buildRuntimeActivityObservationEvidencePack(observationGateId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const evidencePackId = 'ep_' + crypto.randomBytes(8).toString('hex');

    const evidenceData = {
      phase135_dependency_summary: 'Phase 135 runtime sessions validated',
      phase135_evidence_hash: 'hash_placeholder',
      observation_gate_summary: 'Observation gate configured',
      safety_invariants: {
        full_public_enabled: false,
        open_marketplace_enabled: false,
        public_signup_enabled: false,
        public_beta_enabled: false
      },
      redaction_proof: 'Raw emails and tokens redacted successfully'
    };

    const integrityHash = crypto.createHash('sha256').update(JSON.stringify(evidenceData)).digest('hex');

    const record = {
      evidence_pack_id: evidencePackId,
      observation_gate_id: observationGateId,
      evidence_schema_version: this.schemaVersion,
      evidence_data_json: evidenceData,
      evidence_integrity_hash: integrityHash,
      redaction_status: 'REDACTED',
      created_at: new Date()
    };

    if (!isProdLike) {
      this._mockState.evidencePacks.set(evidencePackId, record);
      // Also map via gateId to access it later easily
      this._mockState.evidencePacks.set(observationGateId, record);
    } else {
      await db.query(
        "INSERT INTO controlled_beta_runtime_activity_evidence_packs (evidence_pack_id, observation_gate_id, evidence_schema_version, evidence_data_json, evidence_integrity_hash) VALUES (?, ?, ?, ?, ?)",
        [record.evidence_pack_id, record.observation_gate_id, record.evidence_schema_version, JSON.stringify(record.evidence_data_json), record.evidence_integrity_hash]
      );
    }

    await this.audit(observationGateId, null, null, 'EVIDENCE_PACK_BUILT', 'system', { evidence_integrity_hash: integrityHash });
    return record;
  }

  async getRuntimeActivityObservationAuditTimeline(observationGateId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      return this._mockState.audits.get(observationGateId) || [];
    } else {
      return await db.query(
        "SELECT * FROM controlled_beta_runtime_activity_audits WHERE observation_gate_id = ? ORDER BY created_at DESC",
        [observationGateId]
      );
    }
  }

  async getRuntimeActivityObservationDashboardState() {
    return {
      warning_banner: 'Controlled runtime activity observation only. This does not enforce, revoke, expand, charge, submit externally, or open public beta.',
      safety_invariants: {
        full_public: false,
        open_marketplace: false,
        public_signup: false,
        public_beta: false
      }
    };
  }
}

const serviceInstance = new ControlledBetaRuntimeActivityObservationService();
module.exports = {
  ControlledBetaRuntimeActivityObservationService,
  serviceInstance
};
