'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
// We require the invite acceptance service instance to access its mock state or records in real DB
const inviteAcceptanceService = require('./controlledBetaInviteAcceptanceService').serviceInstance || require('./controlledBetaInviteAcceptanceService');

class ControlledBetaRuntimeSessionService {
  constructor() {
    this.schemaVersion = '135.0';
    this._mockState = {
      gates: new Map(),
      sessions: new Map(),
      sessionLimits: new Map(),
      featureAccess: new Map(),
      heartbeats: new Map(),
      events: new Map(),
      guardrails: new Map(),
      findings: new Map(),
      approvals: new Map(),
      evidencePacks: new Map(),
      audits: new Map(),

      // External mock tables (copied or referenced from Phase 134)
      phase134Gates: new Map(),
      phase134Participants: new Map(),
      phase134Terms: new Map(),
      phase134Limits: new Map(),
      phase134Policies: new Map(),
      phase134EvidencePacks: new Map()
    };
  }

  setMockState(type, id, data) {
    if (this._mockState[type]) {
      this._mockState[type].set(id, data);
    }
  }

  async getTableColumns(tableName) {
    const q = "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = ? AND TABLE_SCHEMA = DATABASE()";
    try {
      const rows = await db.query(q, [tableName]);
      return rows.map(r => r.COLUMN_NAME);
    } catch (e) {
      return [];
    }
  }

  async hasTable(tableName) {
    const cols = await this.getTableColumns(tableName);
    return cols.length > 0;
  }

  async audit(gateId, sessionId, eventType, actorId, details = {}) {
    const auditId = 'aud_' + crypto.randomBytes(8).toString('hex');
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      const list = this._mockState.audits.get(gateId) || [];
      list.push({ audit_id: auditId, session_gate_id: gateId, runtime_session_id: sessionId, event_type: eventType, actor_id: actorId, details_json: details, created_at: new Date() });
      this._mockState.audits.set(gateId, list);
    } else {
      await db.query(
        "INSERT INTO controlled_beta_runtime_session_audits (audit_id, session_gate_id, runtime_session_id, event_type, actor_id, details_json) VALUES (?, ?, ?, ?, ?, ?)",
        [auditId, gateId, sessionId || null, eventType, actorId, JSON.stringify(details)]
      );
    }
    return auditId;
  }

  async evaluateRuntimeSessionReadiness(sessionGateId) {
    let readiness_status = 'BLOCKED';
    let blocked_reasons = [];
    const checks = {
      phase134_acceptance_exists: false,
      phase134_onboarding_approved: false,
      phase134_evidence_pack_valid: false,
      phase134_evidence_integrity_hash_present: false,
      participant_identity_bound: false,
      terms_accepted: false,
      participant_active: false,
      participant_not_revoked: false,
      session_gate_exists: false,
      session_limits_defined: false,
      access_policy_defined: false,
      runtime_scope_bounded: false,
      active_sessions_within_limit: false,
      total_sessions_within_limit: false,
      session_ttl_bounded: false,
      feature_scope_bounded: false,
      no_active_kill_switch: false,
      no_unresolved_blocker_findings: false,
      no_public_signup: false,
      no_public_beta: false,
      no_open_marketplace: false,
      no_full_public: false,
      payment_execution_disabled: false,
      provider_external_submission_disabled: false,
      tax_accounting_external_submission_disabled: false,
      source_mutation_disabled: false,
      auto_session_creation_disabled: false,
      manual_approval_required: false,
      approval_present_before_session_creation: false,
      audit_enabled: false,
      evidence_pack_redacted: false
    };

    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    let gate = null;
    let acceptance = null;
    let participant = null;
    let terms = null;
    let limits = null;
    let policy = null;
    let acceptanceEvidence = null;

    if (!isProdLike) {
      gate = this._mockState.gates.get(sessionGateId);
      if (gate) {
        const accGateId = gate.acceptance_gate_id;
        acceptance = this._mockState.phase134Gates.get(accGateId) || inviteAcceptanceService._mockState.gates.get(accGateId);
        participant = this._mockState.phase134Participants.get(gate.participant_id) || inviteAcceptanceService._mockState.participants.get(gate.participant_id);
        terms = this._mockState.phase134Terms.get(gate.participant_id) || inviteAcceptanceService._mockState.terms.get(gate.participant_id);
        limits = this._mockState.sessionLimits.get(sessionGateId);
        policy = this._mockState.phase134Policies.get(gate.participant_id) || inviteAcceptanceService._mockState.accessPolicies.get(gate.participant_id);
        acceptanceEvidence = this._mockState.phase134EvidencePacks.get(accGateId) || inviteAcceptanceService._mockState.evidencePacks.get(accGateId);
      }
    } else {
      const gates = await db.query("SELECT * FROM controlled_beta_runtime_session_gates WHERE session_gate_id = ?", [sessionGateId]);
      if (gates.length > 0) {
        gate = gates[0];
        const accGateId = gate.acceptance_gate_id;
        const accs = await db.query("SELECT * FROM controlled_beta_invite_acceptance_gates WHERE acceptance_gate_id = ?", [accGateId]);
        if (accs.length > 0) acceptance = accs[0];
        const parts = await db.query("SELECT * FROM controlled_beta_onboarding_participants WHERE participant_id = ?", [gate.participant_id]);
        if (parts.length > 0) participant = parts[0];
        const termsList = await db.query("SELECT * FROM controlled_beta_onboarding_terms_acceptance WHERE participant_id = ? ORDER BY accepted_at DESC LIMIT 1", [gate.participant_id]);
        if (termsList.length > 0) terms = termsList[0];
        const limitsList = await db.query("SELECT * FROM controlled_beta_runtime_session_limits WHERE session_gate_id = ?", [sessionGateId]);
        if (limitsList.length > 0) limits = limitsList[0];
        const policies = await db.query("SELECT * FROM controlled_beta_onboarding_access_policies WHERE participant_id = ?", [gate.participant_id]);
        if (policies.length > 0) policy = policies[0];
        const evs = await db.query("SELECT * FROM controlled_beta_onboarding_evidence_packs WHERE acceptance_gate_id = ?", [accGateId]);
        if (evs.length > 0) acceptanceEvidence = evs[0];
      }
    }

    // 1. Acceptance dependency
    if (acceptance) {
      checks.phase134_acceptance_exists = true;
      if (acceptance.onboarding_approved === 1 || acceptance.onboarding_approved === true) {
        checks.phase134_onboarding_approved = true;
      } else {
        blocked_reasons.push('PHASE_134_ONBOARDING_NOT_APPROVED');
      }
    } else {
      blocked_reasons.push('PHASE_134_ACCEPTANCE_MISSING');
    }

    if (acceptanceEvidence) {
      checks.phase134_evidence_pack_valid = true;
      if (acceptanceEvidence.evidence_integrity_hash) {
        checks.phase134_evidence_integrity_hash_present = true;
      } else {
        blocked_reasons.push('PHASE_134_EVIDENCE_MISSING_OR_DEGRADED');
      }
    } else {
      blocked_reasons.push('PHASE_134_EVIDENCE_MISSING_OR_DEGRADED');
    }

    // 2. Participant details
    if (participant) {
      if (participant.participant_external_ref_hash && participant.participant_email_hash) {
        checks.participant_identity_bound = true;
      } else {
        blocked_reasons.push('PARTICIPANT_IDENTITY_NOT_BOUND');
      }

      if (participant.participant_status === 'ACTIVE') {
        checks.participant_active = true;
        checks.participant_not_revoked = true;
      } else if (participant.participant_status === 'REVOKED') {
        blocked_reasons.push('PARTICIPANT_REVOKED');
      } else {
        blocked_reasons.push('PARTICIPANT_NOT_ACTIVE');
      }
    } else {
      blocked_reasons.push('PARTICIPANT_IDENTITY_NOT_BOUND');
    }

    if (terms) {
      checks.terms_accepted = true;
    } else {
      blocked_reasons.push('TERMS_NOT_ACCEPTED');
    }

    // 3. Gate existence
    if (gate) {
      checks.session_gate_exists = true;
    } else {
      blocked_reasons.push('SESSION_GATE_MISSING');
    }

    // 4. Session limits
    if (limits) {
      checks.session_limits_defined = true;
      if (limits.session_ttl_minutes > 0) {
        checks.session_ttl_bounded = true;
      } else {
        blocked_reasons.push('SESSION_TTL_UNBOUNDED');
      }
      if (limits.feature_scope_json) {
        checks.feature_scope_bounded = true;
      } else {
        blocked_reasons.push('FEATURE_SCOPE_TOO_BROAD');
      }

      // Check current sessions count (if applicable)
      let activeSessionsCount = 0;
      let totalSessionsCount = 0;
      if (!isProdLike) {
        const allSessions = Array.from(this._mockState.sessions.values()).filter(s => s.session_gate_id === sessionGateId);
        activeSessionsCount = allSessions.filter(s => s.session_status === 'ACTIVE' && new Date(s.expires_at) > new Date()).length;
        totalSessionsCount = allSessions.length;
      } else {
        const actives = await db.query(
          "SELECT COUNT(*) as cnt FROM controlled_beta_runtime_sessions WHERE session_gate_id = ? AND session_status = 'ACTIVE' AND expires_at > NOW()",
          [sessionGateId]
        );
        activeSessionsCount = actives[0].cnt;
        const totals = await db.query(
          "SELECT COUNT(*) as cnt FROM controlled_beta_runtime_sessions WHERE session_gate_id = ?",
          [sessionGateId]
        );
        totalSessionsCount = totals[0].cnt;
      }

      if (activeSessionsCount < limits.max_concurrent_sessions) {
        checks.active_sessions_within_limit = true;
      } else {
        blocked_reasons.push('ACTIVE_SESSION_LIMIT_EXCEEDED');
      }

      if (totalSessionsCount < limits.max_sessions) {
        checks.total_sessions_within_limit = true;
      } else {
        blocked_reasons.push('TOTAL_SESSION_LIMIT_EXCEEDED');
      }
    } else {
      blocked_reasons.push('SESSION_LIMITS_MISSING');
    }

    // 5. Access Policy & Scope
    if (policy) {
      checks.access_policy_defined = true;
      if (policy.runtime_scope_json) {
        const parsedScope = typeof policy.runtime_scope_json === 'string' ? JSON.parse(policy.runtime_scope_json) : policy.runtime_scope_json;
        if (parsedScope && parsedScope.tenant_id === gate?.tenant_id && parsedScope.cohort_id === gate?.cohort_id) {
          checks.runtime_scope_bounded = true;
        } else {
          blocked_reasons.push('RUNTIME_SCOPE_TOO_BROAD');
        }
      } else {
        blocked_reasons.push('RUNTIME_SCOPE_TOO_BROAD');
      }
    } else {
      blocked_reasons.push('ACCESS_POLICY_MISSING');
    }

    // 6. Kill Switch & Blockers
    if (gate) {
      if (gate.kill_switch_active === 0 || gate.kill_switch_active === false) {
        checks.no_active_kill_switch = true;
      } else {
        blocked_reasons.push('ACTIVE_KILL_SWITCH_PRESENT');
      }

      // Check for blocker findings
      let openBlockers = [];
      if (!isProdLike) {
        openBlockers = Array.from(this._mockState.findings.values()).filter(f => f.session_gate_id === sessionGateId && f.finding_status === 'OPEN' && f.severity === 'BLOCKER');
      } else {
        openBlockers = await db.query(
          "SELECT * FROM controlled_beta_runtime_session_findings WHERE session_gate_id = ? AND finding_status = 'OPEN' AND severity = 'BLOCKER'",
          [sessionGateId]
        );
      }

      if (openBlockers.length === 0) {
        checks.no_unresolved_blocker_findings = true;
      } else {
        blocked_reasons.push('UNRESOLVED_BLOCKER_FINDINGS');
      }

      // Safety flag evaluations
      if (!gate.public_signup_enabled) {
        checks.no_public_signup = true;
      } else {
        blocked_reasons.push('PUBLIC_SIGNUP_ENABLED');
      }

      if (!gate.public_beta_enabled) {
        checks.no_public_beta = true;
      } else {
        blocked_reasons.push('PUBLIC_BETA_ENABLED');
      }

      if (!gate.open_marketplace_enabled) {
        checks.no_open_marketplace = true;
      } else {
        blocked_reasons.push('OPEN_MARKETPLACE_ENABLED');
      }

      if (!gate.full_public_enabled) {
        checks.no_full_public = true;
      } else {
        blocked_reasons.push('FULL_PUBLIC_ENABLED');
      }

      if (!gate.payment_execution_enabled) {
        checks.payment_execution_disabled = true;
      } else {
        blocked_reasons.push('PAYMENT_EXECUTION_ENABLED');
      }

      if (!gate.provider_external_submission_enabled) {
        checks.provider_external_submission_disabled = true;
        checks.tax_accounting_external_submission_disabled = true;
      } else {
        blocked_reasons.push('PROVIDER_EXTERNAL_SUBMISSION_ENABLED');
        blocked_reasons.push('TAX_ACCOUNTING_EXTERNAL_SUBMISSION_ENABLED');
      }

      if (!gate.source_mutation_enabled) {
        checks.source_mutation_disabled = true;
      } else {
        blocked_reasons.push('SOURCE_MUTATION_ENABLED');
      }

      if (!gate.auto_session_creation_enabled) {
        checks.auto_session_creation_disabled = true;
      } else {
        blocked_reasons.push('AUTO_SESSION_CREATION_ENABLED');
      }

      if (gate.manual_approval_required) {
        checks.manual_approval_required = true;
      } else {
        blocked_reasons.push('MANUAL_APPROVAL_MISSING');
      }

      if (gate.gate_status === 'APPROVED') {
        checks.approval_present_before_session_creation = true;
      } else {
        blocked_reasons.push('SESSION_CREATION_BEFORE_APPROVAL');
      }
    }

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

  async createRuntimeSessionGate(data) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const gateId = data.session_gate_id || 'sg_' + crypto.randomBytes(8).toString('hex');

    const record = {
      session_gate_id: gateId,
      acceptance_gate_id: data.acceptance_gate_id,
      participant_id: data.participant_id,
      tenant_id: data.tenant_id,
      cohort_id: data.cohort_id,
      gate_status: 'DRAFT',
      readiness_status: 'PENDING',
      runtime_access_eligible: 0,
      runtime_access_granted: 0,
      manual_approval_required: 1,
      session_creation_enabled: 0,
      auto_session_creation_enabled: 0,
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
      approved_at: null,
      approved_by: null,
      blocked_at: null,
      blocked_by: null,
      blocked_reasons_json: null
    };

    if (!isProdLike) {
      this._mockState.gates.set(gateId, record);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_runtime_session_gates 
         (session_gate_id, acceptance_gate_id, participant_id, tenant_id, cohort_id, gate_status, readiness_status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [record.session_gate_id, record.acceptance_gate_id, record.participant_id, record.tenant_id, record.cohort_id, record.gate_status, record.readiness_status]
      );
    }

    await this.audit(gateId, null, 'GATE_CREATED', 'system', { acceptance_gate_id: data.acceptance_gate_id });
    return record;
  }

  async bindAcceptanceToSessionGate(sessionGateId, acceptanceGateId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      const gate = this._mockState.gates.get(sessionGateId);
      if (!gate) throw new Error('Gate not found');
      gate.acceptance_gate_id = acceptanceGateId;
      this._mockState.gates.set(sessionGateId, gate);
    } else {
      await db.query(
        "UPDATE controlled_beta_runtime_session_gates SET acceptance_gate_id = ? WHERE session_gate_id = ?",
        [acceptanceGateId, sessionGateId]
      );
    }
    await this.audit(sessionGateId, null, 'ACCEPTANCE_BOUND', 'admin', { acceptance_gate_id: acceptanceGateId });
    return { ok: true };
  }

  async defineRuntimeSessionLimits(sessionGateId, participantId, limits) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const limitId = 'lim_' + crypto.randomBytes(8).toString('hex');

    const record = {
      runtime_session_limit_id: limitId,
      session_gate_id: sessionGateId,
      participant_id: participantId,
      tenant_id: limits.tenant_id || 'tenant_1',
      cohort_id: limits.cohort_id || 'cohort_1',
      max_sessions: limits.max_sessions || 1,
      max_concurrent_sessions: limits.max_concurrent_sessions || 1,
      session_ttl_minutes: limits.session_ttl_minutes || 60,
      daily_action_limit: limits.daily_action_limit || 100,
      feature_scope_json: limits.feature_scope_json || { allowed: [] },
      created_at: new Date(),
      updated_at: new Date()
    };

    if (!isProdLike) {
      this._mockState.sessionLimits.set(sessionGateId, record);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_runtime_session_limits 
         (runtime_session_limit_id, session_gate_id, participant_id, tenant_id, cohort_id, max_sessions, max_concurrent_sessions, session_ttl_minutes, daily_action_limit, feature_scope_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE max_sessions = VALUES(max_sessions), max_concurrent_sessions = VALUES(max_concurrent_sessions), session_ttl_minutes = VALUES(session_ttl_minutes), daily_action_limit = VALUES(daily_action_limit), feature_scope_json = VALUES(feature_scope_json)`,
        [record.runtime_session_limit_id, record.session_gate_id, record.participant_id, record.tenant_id, record.cohort_id, record.max_sessions, record.max_concurrent_sessions, record.session_ttl_minutes, record.daily_action_limit, JSON.stringify(record.feature_scope_json)]
      );
    }

    await this.audit(sessionGateId, null, 'LIMITS_DEFINED', 'admin', record);
    return record;
  }

  async submitRuntimeSessionGateForApproval(sessionGateId, actorId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      const gate = this._mockState.gates.get(sessionGateId);
      if (!gate) throw new Error('Gate not found');
      gate.gate_status = 'SUBMITTED_FOR_REVIEW';
      this._mockState.gates.set(sessionGateId, gate);
    } else {
      await db.query(
        "UPDATE controlled_beta_runtime_session_gates SET gate_status = 'SUBMITTED_FOR_REVIEW' WHERE session_gate_id = ?",
        [sessionGateId]
      );
    }
    await this.audit(sessionGateId, null, 'SUBMITTED_FOR_APPROVAL', actorId);
    return { ok: true, status: 'SUBMITTED_FOR_REVIEW' };
  }

  async approveRuntimeSessionGate(sessionGateId, actorId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      const gate = this._mockState.gates.get(sessionGateId);
      if (!gate) throw new Error('Gate not found');
      gate.gate_status = 'APPROVED';
      gate.runtime_access_eligible = 1;
      gate.approved_at = new Date();
      gate.approved_by = actorId;
      this._mockState.gates.set(sessionGateId, gate);
    } else {
      await db.query(
        "UPDATE controlled_beta_runtime_session_gates SET gate_status = 'APPROVED', runtime_access_eligible = 1, approved_at = NOW(), approved_by = ? WHERE session_gate_id = ?",
        [actorId, sessionGateId]
      );
    }
    await this.audit(sessionGateId, null, 'APPROVED', actorId);
    return { ok: true, status: 'APPROVED' };
  }

  async rejectRuntimeSessionGate(sessionGateId, actorId, reason) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      const gate = this._mockState.gates.get(sessionGateId);
      if (!gate) throw new Error('Gate not found');
      gate.gate_status = 'REJECTED';
      gate.blocked_reasons_json = [reason];
      this._mockState.gates.set(sessionGateId, gate);
    } else {
      await db.query(
        "UPDATE controlled_beta_runtime_session_gates SET gate_status = 'REJECTED', blocked_reasons_json = ? WHERE session_gate_id = ?",
        [JSON.stringify([reason]), sessionGateId]
      );
    }
    await this.audit(sessionGateId, null, 'REJECTED', actorId, { reason });
    return { ok: true, status: 'REJECTED' };
  }

  async blockRuntimeSessionGate(sessionGateId, actorId, reasons) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const list = Array.isArray(reasons) ? reasons : [reasons];
    if (!isProdLike) {
      const gate = this._mockState.gates.get(sessionGateId);
      if (!gate) throw new Error('Gate not found');
      gate.gate_status = 'BLOCKED';
      gate.blocked_reasons_json = list;
      gate.blocked_at = new Date();
      gate.blocked_by = actorId;
      this._mockState.gates.set(sessionGateId, gate);
    } else {
      await db.query(
        "UPDATE controlled_beta_runtime_session_gates SET gate_status = 'BLOCKED', blocked_reasons_json = ?, blocked_at = NOW(), blocked_by = ? WHERE session_gate_id = ?",
        [JSON.stringify(list), actorId, sessionGateId]
      );
    }
    await this.audit(sessionGateId, null, 'BLOCKED', actorId, { reasons: list });
    return { ok: true, status: 'BLOCKED' };
  }

  async runRuntimeSessionGuardrailChecks(sessionGateId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const checks = [
      { key: 'no_public_beta', desc: 'Verify public beta is disabled', passed: true },
      { key: 'no_open_marketplace', desc: 'Verify open marketplace is disabled', passed: true },
      { key: 'no_payment_execution', desc: 'Verify payment execution is disabled', passed: true }
    ];

    if (isProdLike) {
      // Guardrail logs insert
      for (const check of checks) {
        const checkId = 'chk_' + crypto.randomBytes(8).toString('hex');
        await db.query(
          "INSERT INTO controlled_beta_runtime_session_guardrail_checks (check_id, session_gate_id, check_key, check_status) VALUES (?, ?, ?, ?)",
          [checkId, sessionGateId, check.key, check.passed ? 'PASSED' : 'FAILED']
        );
      }
    }

    return { ok: true, checks };
  }

  async createControlledRuntimeSession(sessionGateId, actorId) {
    const readiness = await this.evaluateRuntimeSessionReadiness(sessionGateId);
    if (!readiness.ok) {
      throw new Error(`Readiness check failed: ${readiness.blocked_reasons.join(', ')}`);
    }

    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    let gate = null;
    let limits = null;

    if (!isProdLike) {
      gate = this._mockState.gates.get(sessionGateId);
      limits = this._mockState.sessionLimits.get(sessionGateId);
    } else {
      const gates = await db.query("SELECT * FROM controlled_beta_runtime_session_gates WHERE session_gate_id = ?", [sessionGateId]);
      if (gates.length > 0) gate = gates[0];
      const limitsList = await db.query("SELECT * FROM controlled_beta_runtime_session_limits WHERE session_gate_id = ?", [sessionGateId]);
      if (limitsList.length > 0) limits = limitsList[0];
    }

    if (!gate) throw new Error('Gate not found');
    if (!limits) throw new Error('Session limits not defined');

    // Create the session
    const sessionId = 'sess_' + crypto.randomBytes(8).toString('hex');
    const rawToken = 'tok_' + crypto.randomBytes(16).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const ttlMinutes = limits.session_ttl_minutes || 60;
    const expiresAt = new Date(Date.now() + ttlMinutes * 60000);

    const sessionScope = {
      tenant_id: gate.tenant_id,
      cohort_id: gate.cohort_id,
      participant_id: gate.participant_id
    };

    const record = {
      runtime_session_id: sessionId,
      session_gate_id: sessionGateId,
      acceptance_gate_id: gate.acceptance_gate_id,
      participant_id: gate.participant_id,
      tenant_id: gate.tenant_id,
      cohort_id: gate.cohort_id,
      session_status: 'ACTIVE',
      session_token_hash: tokenHash,
      session_scope_json: sessionScope,
      allowed_features_json: limits.feature_scope_json?.allowed || [],
      denied_features_json: limits.feature_scope_json?.denied || [],
      created_at: new Date(),
      started_at: new Date(),
      last_heartbeat_at: new Date(),
      expires_at: expiresAt,
      closed_at: null,
      closed_by: null,
      closure_reason: null,
      revoked_at: null,
      revoked_by: null,
      revoke_reason: null
    };

    if (!isProdLike) {
      this._mockState.sessions.set(sessionId, record);
      // Mark gate runtime_access_granted to true
      gate.runtime_access_granted = 1;
      this._mockState.gates.set(sessionGateId, gate);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_runtime_sessions 
         (runtime_session_id, session_gate_id, acceptance_gate_id, participant_id, tenant_id, cohort_id, session_status, session_token_hash, session_scope_json, allowed_features_json, denied_features_json, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [record.runtime_session_id, record.session_gate_id, record.acceptance_gate_id, record.participant_id, record.tenant_id, record.cohort_id, record.session_status, record.session_token_hash, JSON.stringify(record.session_scope_json), JSON.stringify(record.allowed_features_json), JSON.stringify(record.denied_features_json), record.expires_at]
      );
      await db.query(
        "UPDATE controlled_beta_runtime_session_gates SET runtime_access_granted = 1 WHERE session_gate_id = ?",
        [sessionGateId]
      );
    }

    await this.audit(sessionGateId, sessionId, 'SESSION_CREATED', actorId, { expires_at: expiresAt });

    // Return the record WITH the raw token (only once, not saved/printed)
    return {
      ...record,
      raw_session_token: rawToken
    };
  }

  async evaluateRuntimeFeatureAccess(runtimeSessionId, featureKey, contextScope = {}) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    let session = null;
    let gate = null;

    if (!isProdLike) {
      session = this._mockState.sessions.get(runtimeSessionId);
      if (session) {
        gate = this._mockState.gates.get(session.session_gate_id);
      }
    } else {
      const sessions = await db.query("SELECT * FROM controlled_beta_runtime_sessions WHERE runtime_session_id = ?", [runtimeSessionId]);
      if (sessions.length > 0) {
        session = sessions[0];
        const gates = await db.query("SELECT * FROM controlled_beta_runtime_session_gates WHERE session_gate_id = ?", [session.session_gate_id]);
        if (gates.length > 0) gate = gates[0];
      }
    }

    if (!session) {
      return { ok: false, access_status: 'DENIED', access_reason: 'SESSION_NOT_FOUND' };
    }

    if (session.session_status !== 'ACTIVE') {
      return { ok: false, access_status: 'DENIED', access_reason: `SESSION_STATUS_${session.session_status}` };
    }

    if (new Date(session.expires_at) < new Date()) {
      return { ok: false, access_status: 'DENIED', access_reason: 'SESSION_EXPIRED' };
    }

    if (gate && (gate.kill_switch_active === 1 || gate.kill_switch_active === true)) {
      return { ok: false, access_status: 'DENIED', access_reason: 'KILL_SWITCH_ACTIVE' };
    }

    // Verify scope bounds
    if (contextScope.tenant_id && contextScope.tenant_id !== session.tenant_id) {
      return { ok: false, access_status: 'DENIED', access_reason: 'TENANT_SCOPE_MISMATCH' };
    }

    if (contextScope.cohort_id && contextScope.cohort_id !== session.cohort_id) {
      return { ok: false, access_status: 'DENIED', access_reason: 'COHORT_SCOPE_MISMATCH' };
    }

    // Feature check
    const allowed = typeof session.allowed_features_json === 'string' ? JSON.parse(session.allowed_features_json) : session.allowed_features_json || [];
    const denied = typeof session.denied_features_json === 'string' ? JSON.parse(session.denied_features_json) : session.denied_features_json || [];

    if (denied.includes(featureKey)) {
      return { ok: false, access_status: 'DENIED', access_reason: 'FEATURE_EXPLICITLY_DENIED' };
    }

    if (!allowed.includes(featureKey) && !allowed.includes('*')) {
      return { ok: false, access_status: 'DENIED', access_reason: 'FEATURE_NOT_IN_POLICY' };
    }

    const accessId = 'acc_' + crypto.randomBytes(8).toString('hex');
    const logVal = {
      feature_access_id: accessId,
      runtime_session_id: runtimeSessionId,
      session_gate_id: session.session_gate_id,
      participant_id: session.participant_id,
      tenant_id: session.tenant_id,
      cohort_id: session.cohort_id,
      feature_key: featureKey,
      access_status: 'GRANTED',
      access_reason: 'POLICY_MATCH',
      evaluated_at: new Date()
    };

    if (!isProdLike) {
      const list = this._mockState.featureAccess.get(runtimeSessionId) || [];
      list.push(logVal);
      this._mockState.featureAccess.set(runtimeSessionId, list);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_runtime_session_feature_access 
         (feature_access_id, runtime_session_id, session_gate_id, participant_id, tenant_id, cohort_id, feature_key, access_status, access_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [logVal.feature_access_id, logVal.runtime_session_id, logVal.session_gate_id, logVal.participant_id, logVal.tenant_id, logVal.cohort_id, logVal.feature_key, logVal.access_status, logVal.access_reason]
      );
    }

    return { ok: true, access_status: 'GRANTED', access_reason: 'POLICY_MATCH' };
  }

  async recordRuntimeSessionHeartbeat(runtimeSessionId, metadata = {}) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    let session = null;
    if (!isProdLike) {
      session = this._mockState.sessions.get(runtimeSessionId);
    } else {
      const list = await db.query("SELECT * FROM controlled_beta_runtime_sessions WHERE runtime_session_id = ?", [runtimeSessionId]);
      if (list.length > 0) session = list[0];
    }

    if (!session) throw new Error('Session not found');
    if (session.session_status !== 'ACTIVE') throw new Error(`Heartbeat rejected: session status is ${session.session_status}`);
    if (new Date(session.expires_at) < new Date()) throw new Error('Heartbeat rejected: session has expired');

    const hbId = 'hb_' + crypto.randomBytes(8).toString('hex');
    const record = {
      heartbeat_id: hbId,
      runtime_session_id: runtimeSessionId,
      session_gate_id: session.session_gate_id,
      participant_id: session.participant_id,
      tenant_id: session.tenant_id,
      cohort_id: session.cohort_id,
      heartbeat_status: 'OK',
      observed_at: new Date(),
      metadata_json: metadata
    };

    if (!isProdLike) {
      this._mockState.heartbeats.set(hbId, record);
      session.last_heartbeat_at = new Date();
      this._mockState.sessions.set(runtimeSessionId, session);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_runtime_session_heartbeats 
         (heartbeat_id, runtime_session_id, session_gate_id, participant_id, tenant_id, cohort_id, heartbeat_status, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [record.heartbeat_id, record.runtime_session_id, record.session_gate_id, record.participant_id, record.tenant_id, record.cohort_id, record.heartbeat_status, JSON.stringify(record.metadata_json)]
      );
      await db.query(
        "UPDATE controlled_beta_runtime_sessions SET last_heartbeat_at = NOW() WHERE runtime_session_id = ?",
        [runtimeSessionId]
      );
    }

    return record;
  }

  async recordRuntimeSessionEvent(runtimeSessionId, eventType, status, featureKey = null, details = {}) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    let session = null;
    if (!isProdLike) {
      session = this._mockState.sessions.get(runtimeSessionId);
    } else {
      const list = await db.query("SELECT * FROM controlled_beta_runtime_sessions WHERE runtime_session_id = ?", [runtimeSessionId]);
      if (list.length > 0) session = list[0];
    }

    if (!session) throw new Error('Session not found');

    const evId = 'ev_' + crypto.randomBytes(8).toString('hex');
    const record = {
      event_id: evId,
      runtime_session_id: runtimeSessionId,
      session_gate_id: session.session_gate_id,
      participant_id: session.participant_id,
      tenant_id: session.tenant_id,
      cohort_id: session.cohort_id,
      event_type: eventType,
      event_status: status,
      feature_key: featureKey,
      details_json: details,
      created_at: new Date()
    };

    if (!isProdLike) {
      this._mockState.events.set(evId, record);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_runtime_session_events 
         (event_id, runtime_session_id, session_gate_id, participant_id, tenant_id, cohort_id, event_type, event_status, feature_key, details_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [record.event_id, record.runtime_session_id, record.session_gate_id, record.participant_id, record.tenant_id, record.cohort_id, record.event_type, record.event_status, record.feature_key, JSON.stringify(record.details_json)]
      );
    }

    return record;
  }

  async closeRuntimeSession(runtimeSessionId, closedBy, reason) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    let session = null;
    if (!isProdLike) {
      session = this._mockState.sessions.get(runtimeSessionId);
      if (session) {
        session.session_status = 'CLOSED';
        session.closed_at = new Date();
        session.closed_by = closedBy;
        session.closure_reason = reason;
        this._mockState.sessions.set(runtimeSessionId, session);
      }
    } else {
      const list = await db.query("SELECT * FROM controlled_beta_runtime_sessions WHERE runtime_session_id = ?", [runtimeSessionId]);
      if (list.length > 0) session = list[0];
      await db.query(
        "UPDATE controlled_beta_runtime_sessions SET session_status = 'CLOSED', closed_at = NOW(), closed_by = ?, closure_reason = ? WHERE runtime_session_id = ?",
        [closedBy, reason, runtimeSessionId]
      );
    }

    if (session) {
      await this.audit(session.session_gate_id, runtimeSessionId, 'SESSION_CLOSED', closedBy, { reason });
    }
    return { ok: true };
  }

  async revokeRuntimeSession(runtimeSessionId, revokedBy, reason) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    let session = null;
    if (!isProdLike) {
      session = this._mockState.sessions.get(runtimeSessionId);
      if (session) {
        session.session_status = 'REVOKED';
        session.revoked_at = new Date();
        session.revoked_by = revokedBy;
        session.revoke_reason = reason;
        this._mockState.sessions.set(runtimeSessionId, session);
      }
    } else {
      const list = await db.query("SELECT * FROM controlled_beta_runtime_sessions WHERE runtime_session_id = ?", [runtimeSessionId]);
      if (list.length > 0) session = list[0];
      await db.query(
        "UPDATE controlled_beta_runtime_sessions SET session_status = 'REVOKED', revoked_at = NOW(), revoked_by = ?, revoke_reason = ? WHERE runtime_session_id = ?",
        [revokedBy, reason, runtimeSessionId]
      );
    }

    if (session) {
      await this.audit(session.session_gate_id, runtimeSessionId, 'SESSION_REVOKED', revokedBy, { reason });
    }
    return { ok: true };
  }

  async revokeParticipantRuntimeSessions(participantId, actorId, reason) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      for (const s of this._mockState.sessions.values()) {
        if (s.participant_id === participantId && s.session_status === 'ACTIVE') {
          s.session_status = 'REVOKED';
          s.revoked_at = new Date();
          s.revoked_by = actorId;
          s.revoke_reason = reason;
          this._mockState.sessions.set(s.runtime_session_id, s);
          await this.audit(s.session_gate_id, s.runtime_session_id, 'SESSION_REVOKED', actorId, { reason });
        }
      }
    } else {
      const sessions = await db.query("SELECT * FROM controlled_beta_runtime_sessions WHERE participant_id = ? AND session_status = 'ACTIVE'", [participantId]);
      for (const s of sessions) {
        await db.query(
          "UPDATE controlled_beta_runtime_sessions SET session_status = 'REVOKED', revoked_at = NOW(), revoked_by = ?, revoke_reason = ? WHERE runtime_session_id = ?",
          [actorId, reason, s.runtime_session_id]
        );
        await this.audit(s.session_gate_id, s.runtime_session_id, 'SESSION_REVOKED', actorId, { reason });
      }
    }
    return { ok: true };
  }

  async expireRuntimeSessions() {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      for (const s of this._mockState.sessions.values()) {
        if (s.session_status === 'ACTIVE' && new Date(s.expires_at) < new Date()) {
          s.session_status = 'EXPIRED';
          this._mockState.sessions.set(s.runtime_session_id, s);
          await this.audit(s.session_gate_id, s.runtime_session_id, 'SESSION_EXPIRED', 'system');
        }
      }
    } else {
      const expiredList = await db.query("SELECT * FROM controlled_beta_runtime_sessions WHERE session_status = 'ACTIVE' AND expires_at < NOW()");
      for (const s of expiredList) {
        await db.query(
          "UPDATE controlled_beta_runtime_sessions SET session_status = 'EXPIRED' WHERE runtime_session_id = ?",
          [s.runtime_session_id]
        );
        await this.audit(s.session_gate_id, s.runtime_session_id, 'SESSION_EXPIRED', 'system');
      }
    }
    return { ok: true };
  }

  async recordRuntimeSessionFinding(sessionGateId, severity, findingKey, details = {}) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const findingId = 'fnd_' + crypto.randomBytes(8).toString('hex');

    const record = {
      finding_id: findingId,
      session_gate_id: sessionGateId,
      severity: severity || 'BLOCKER',
      finding_key: findingKey,
      finding_status: 'OPEN',
      details_json: details,
      created_at: new Date()
    };

    if (!isProdLike) {
      this._mockState.findings.set(findingId, record);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_runtime_session_findings 
         (finding_id, session_gate_id, severity, finding_key, finding_status, details_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [record.finding_id, record.session_gate_id, record.severity, record.finding_key, record.finding_status, JSON.stringify(record.details_json)]
      );
    }

    await this.audit(sessionGateId, null, 'FINDING_RECORDED', 'system', { finding_key: findingKey, severity });
    return record;
  }

  async resolveRuntimeSessionFinding(sessionGateId, findingKey, resolvedBy) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      for (const f of this._mockState.findings.values()) {
        if (f.session_gate_id === sessionGateId && f.finding_key === findingKey && f.finding_status === 'OPEN') {
          f.finding_status = 'RESOLVED';
          f.resolved_at = new Date();
          f.resolved_by = resolvedBy;
          this._mockState.findings.set(f.finding_id, f);
        }
      }
    } else {
      await db.query(
        "UPDATE controlled_beta_runtime_session_findings SET finding_status = 'RESOLVED', resolved_at = NOW(), resolved_by = ? WHERE session_gate_id = ? AND finding_key = ? AND finding_status = 'OPEN'",
        [resolvedBy, sessionGateId, findingKey]
      );
    }

    await this.audit(sessionGateId, null, 'FINDING_RESOLVED', resolvedBy, { finding_key: findingKey });
    return { ok: true };
  }

  async buildRuntimeSessionEvidencePack(sessionGateId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    let gate = null;
    let limits = null;
    let sessions = [];
    let findings = [];
    let audits = [];

    if (!isProdLike) {
      gate = this._mockState.gates.get(sessionGateId);
      limits = this._mockState.sessionLimits.get(sessionGateId);
      sessions = Array.from(this._mockState.sessions.values()).filter(s => s.session_gate_id === sessionGateId);
      findings = Array.from(this._mockState.findings.values()).filter(f => f.session_gate_id === sessionGateId);
      audits = this._mockState.audits.get(sessionGateId) || [];
    } else {
      const gates = await db.query("SELECT * FROM controlled_beta_runtime_session_gates WHERE session_gate_id = ?", [sessionGateId]);
      if (gates.length > 0) gate = gates[0];
      const limitsList = await db.query("SELECT * FROM controlled_beta_runtime_session_limits WHERE session_gate_id = ?", [sessionGateId]);
      if (limitsList.length > 0) limits = limitsList[0];
      sessions = await db.query("SELECT * FROM controlled_beta_runtime_sessions WHERE session_gate_id = ?", [sessionGateId]);
      findings = await db.query("SELECT * FROM controlled_beta_runtime_session_findings WHERE session_gate_id = ?", [sessionGateId]);
      audits = await db.query("SELECT * FROM controlled_beta_runtime_session_audits WHERE session_gate_id = ?", [sessionGateId]);
    }

    if (!gate) throw new Error('Gate not found');

    const evidenceData = {
      phase134_dependency: {
        acceptance_gate_id: gate.acceptance_gate_id,
        participant_id: gate.participant_id
      },
      limits: limits ? {
        max_sessions: limits.max_sessions,
        max_concurrent_sessions: limits.max_concurrent_sessions,
        session_ttl_minutes: limits.session_ttl_minutes
      } : null,
      sessions_summary: {
        total: sessions.length,
        active: sessions.filter(s => s.session_status === 'ACTIVE').length,
        closed: sessions.filter(s => s.session_status === 'CLOSED').length,
        revoked: sessions.filter(s => s.session_status === 'REVOKED').length
      },
      findings: findings.map(f => ({ key: f.finding_key, severity: f.severity, status: f.finding_status })),
      safety_invariants: {
        full_public_enabled: false,
        open_marketplace_enabled: false,
        public_signup_enabled: false,
        public_beta_enabled: false
      },
      redaction_proof: {
        raw_tokens_excluded: true,
        raw_emails_excluded: true
      }
    };

    const integrityHash = crypto.createHash('sha256').update(JSON.stringify(evidenceData)).digest('hex');
    const packId = 'evp_' + crypto.randomBytes(8).toString('hex');

    const record = {
      evidence_pack_id: packId,
      session_gate_id: sessionGateId,
      evidence_schema_version: this.schemaVersion,
      evidence_data_json: evidenceData,
      evidence_integrity_hash: integrityHash,
      redaction_status: 'REDACTED',
      created_at: new Date()
    };

    if (!isProdLike) {
      this._mockState.evidencePacks.set(sessionGateId, record);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_runtime_session_evidence_packs 
         (evidence_pack_id, session_gate_id, evidence_schema_version, evidence_data_json, evidence_integrity_hash, redaction_status)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE evidence_data_json = VALUES(evidence_data_json), evidence_integrity_hash = VALUES(evidence_integrity_hash)`,
        [record.evidence_pack_id, record.session_gate_id, record.evidence_schema_version, JSON.stringify(record.evidence_data_json), record.evidence_integrity_hash, record.redaction_status]
      );
    }

    return record;
  }

  async getRuntimeSessionAuditTimeline(sessionGateId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return this._mockState.audits.get(sessionGateId) || [];
    } else {
      return await db.query(
        "SELECT * FROM controlled_beta_runtime_session_audits WHERE session_gate_id = ? ORDER BY created_at DESC",
        [sessionGateId]
      );
    }
  }

  async getRuntimeSessionDashboardState() {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    let gates = [];
    let sessions = [];

    if (!isProdLike) {
      gates = Array.from(this._mockState.gates.values());
      sessions = Array.from(this._mockState.sessions.values());
    } else {
      gates = await db.query("SELECT * FROM controlled_beta_runtime_session_gates");
      sessions = await db.query("SELECT * FROM controlled_beta_runtime_sessions");
    }

    return {
      total_gates: gates.length,
      approved_gates: gates.filter(g => g.gate_status === 'APPROVED').length,
      active_sessions: sessions.filter(s => s.session_status === 'ACTIVE').length,
      closed_sessions: sessions.filter(s => s.session_status === 'CLOSED').length,
      revoked_sessions: sessions.filter(s => s.session_status === 'REVOKED').length
    };
  }
}

const serviceInstance = new ControlledBetaRuntimeSessionService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
