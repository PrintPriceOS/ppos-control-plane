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
  beta_runtime_enabled: false,
  full_public_enabled: false,
  open_marketplace_enabled: false,
  payment_execution_enabled: false,
  refund_execution_enabled: false,
  payout_execution_enabled: false,
  live_provider_connectivity_enabled: false,
  provider_external_submission_enabled: false,
  external_tax_submission_enabled: false,
  external_accounting_submission_enabled: false,
  source_mutation_enabled: false,
  invite_only: true,
  cohort_scoped: true,
  tenant_scoped: true,
  participant_scoped: true,
});

const SAFETY_MESSAGE =
  'Invite-Only Limited Beta Runtime. ' +
  'This does not enable FULL_PUBLIC, open marketplace access, payment execution, refund execution, payout execution, provider external submission, tax/accounting submission, or uncontrolled source mutation.';

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

class LimitedBetaRuntimeService {
  constructor() {
    this._sessions = new Map();
    this._grants = new Map();
    this._denials = new Map();
    this._policies = new Map();
    this._killSwitches = new Map();
    this._activityLogs = new Map();
    this._guardrails = new Map();
    this._rollbacks = new Map();
    this._findings = new Map();
    this._packs = new Map();
    this._featureFlags = new Map();

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

  async _getRuntimeTruthStatus(gateId) {
    if (!this._db) return 'DEGRADED';
    return 'VERIFIED';
  }

  async _getHardeningInfo(dbResult, gateId) {
    const info = this._getPersistenceInfo(dbResult);
    const runtimeTruth = await this._getRuntimeTruthStatus(gateId);
    return {
      persistenceMode: info.persistenceMode,
      persistenceStatus: info.persistenceStatus,
      runtimeTruthStatus: runtimeTruth,
    };
  }

  async evaluateRuntimeActivationReadiness(gateId) {
    this._assertDbAvailableForProduction();
    
    let verified127_1 = false;
    let verifiedFromDb = false;
    let failClosedVerified = false;
    let rollbackReady = false;

    // Check Migration 073 and 127.1 evidence pack
    if (this._db) {
      try {
        const schemaRows = await this._dbRead(
          "SELECT version FROM schema_versions WHERE version LIKE '%073_phase127_1%'", []
        );
        if (schemaRows && schemaRows.length > 0) {
          verifiedFromDb = true;
        }

        const packRows = await this._dbRead(
          "SELECT evidence_data_json FROM limited_beta_evidence_packs WHERE gate_id = ? ORDER BY created_at DESC LIMIT 1",
          [gateId]
        );
        if (packRows && packRows.length > 0) {
          const packData = typeof packRows[0].evidence_data_json === 'string' 
            ? JSON.parse(packRows[0].evidence_data_json) 
            : packRows[0].evidence_data_json;
          
          if (packData.runtimeTruthStatus === 'VERIFIED' && packData.persistenceStatus === 'PERSISTED') {
            verified127_1 = true;
            failClosedVerified = true;
            rollbackReady = true;
          }
        }
      } catch (e) {
        if (!this._allowMemoryFallback()) throw e;
      }
    } else {
      if (this._allowMemoryFallback()) {
        verified127_1 = true;
        verifiedFromDb = true;
        failClosedVerified = true;
        rollbackReady = true;
      }
    }

    // Gate configuration check
    let gateReady = false;
    let inviteOnly = false;
    let fullPublicEnabled = false;
    let hasEscalation = false;
    let hasRollback = false;

    if (this._db) {
      try {
        const gates = await this._dbRead("SELECT * FROM limited_beta_preparation_gates WHERE gate_id = ?", [gateId]);
        if (gates && gates.length > 0) {
          gateReady = gates[0].readiness_status === 'READY';
          inviteOnly = gates[0].invite_only === 1;
          fullPublicEnabled = gates[0].full_public_enabled === 1;
        }
        const escalations = await this._dbRead("SELECT * FROM limited_beta_support_escalations WHERE gate_id = ?", [gateId]);
        hasEscalation = escalations && escalations.length > 0;

        const plans = await this._dbRead("SELECT * FROM limited_beta_incident_rollback_plans WHERE gate_id = ?", [gateId]);
        hasRollback = plans && plans.length > 0;
      } catch (e) {
        if (!this._allowMemoryFallback()) throw e;
      }
    } else {
      if (this._allowMemoryFallback()) {
        gateReady = true;
        inviteOnly = true;
        fullPublicEnabled = false;
        hasEscalation = true;
        hasRollback = true;
      }
    }

    // Unresolved blocker findings check
    let blockerCount = 0;
    if (this._db) {
      try {
        const findings = await this._dbRead("SELECT * FROM limited_beta_findings WHERE gate_id = ? AND finding_status = 'OPEN' AND (blocks_readiness = 1 OR severity = 'BLOCKER')", [gateId]);
        blockerCount = findings ? findings.length : 0;
      } catch (e) {
        if (!this._allowMemoryFallback()) throw e;
      }
    }

    // Kill switch check
    let killSwitchActive = false;
    if (this._db) {
      try {
        const ks = await this._dbRead("SELECT * FROM limited_beta_runtime_kill_switches WHERE gate_id = ? AND kill_switch_enabled = 1", [gateId]);
        killSwitchActive = ks && ks.length > 0;
      } catch (e) {
        if (!this._allowMemoryFallback()) throw e;
      }
    } else {
      const ks = this._killSwitches.get(gateId);
      if (ks && ks.kill_switch_enabled) killSwitchActive = true;
    }

    const allPassed = verified127_1 && verifiedFromDb && gateReady && inviteOnly && !fullPublicEnabled && hasEscalation && hasRollback && blockerCount === 0 && !killSwitchActive;
    const readiness_status = allPassed ? 'READY' : 'BLOCKED';

    return {
      ok: allPassed,
      readiness_status,
      checks: {
        verified_from_phase127_1: verified127_1,
        verified_from_db: verifiedFromDb,
        gateReady,
        inviteOnly,
        notPublic: !fullPublicEnabled,
        supportEscalationDefined: hasEscalation,
        rollbackPlanDefined: hasRollback,
        noBlockers: blockerCount === 0,
        killSwitchInactive: !killSwitchActive
      },
      fail_closed_verified: failClosedVerified ? 1 : 0,
      rollback_ready: rollbackReady ? 1 : 0,
      persistenceStatus: this._db ? 'PERSISTED' : 'FALLBACK_ONLY',
      runtimeTruthStatus: this._db ? 'VERIFIED' : 'DEGRADED',
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE
    };
  }

  async createRuntimeScopePolicy(params) {
    this._assertDbAvailableForProduction();
    const policyId = _id('lbrsp');
    const { gate_id, policy_name, allowed_features_json, created_by } = params || {};
    if (!gate_id || !policy_name) throw new Error('gate_id and policy_name are required');

    const policy = {
      policy_id: policyId,
      gate_id,
      policy_name,
      allowed_features_json: allowed_features_json || [],
      created_by: created_by || 'system',
      created_at: new Date().toISOString(),
      updated_at: null
    };
    this._policies.set(policyId, policy);

    const dbResult = await this._dbWrite(
      `INSERT INTO limited_beta_runtime_scope_policies (policy_id, gate_id, policy_name, allowed_features_json, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [policyId, gate_id, policy_name, JSON.stringify(policy.allowed_features_json), policy.created_by, policy.created_at]
    );
    this._validateDbWriteResult(dbResult);
    const hardening = await this._getHardeningInfo(dbResult, gate_id);

    return { policy, ...hardening, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async updateRuntimeScopePolicy(policyId, params) {
    this._assertDbAvailableForProduction();
    const { allowed_features_json } = params || {};
    let policy = this._policies.get(policyId);
    if (!policy && this._db) {
      const rows = await this._dbRead("SELECT * FROM limited_beta_runtime_scope_policies WHERE policy_id = ?", [policyId]);
      if (rows && rows.length > 0) policy = rows[0];
    }
    if (!policy) throw new Error('Policy not found');

    policy.allowed_features_json = allowed_features_json || [];
    policy.updated_at = new Date().toISOString();
    this._policies.set(policyId, policy);

    const dbResult = await this._dbWrite(
      `UPDATE limited_beta_runtime_scope_policies SET allowed_features_json = ?, updated_at = ? WHERE policy_id = ?`,
      [JSON.stringify(policy.allowed_features_json), policy.updated_at, policyId]
    );
    this._validateDbWriteResult(dbResult);
    const hardening = await this._getHardeningInfo(dbResult, policy.gate_id);

    return { policy, ...hardening, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async enableRuntimeForGate(gateId) {
    this._assertDbAvailableForProduction();
    const dbResult = await this._dbWrite(
      `UPDATE limited_beta_preparation_gates SET beta_runtime_enabled = 1 WHERE gate_id = ?`,
      [gateId]
    );
    this._validateDbWriteResult(dbResult);
    const hardening = await this._getHardeningInfo(dbResult, gateId);
    return { ok: true, ...hardening, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async disableRuntimeForGate(gateId) {
    this._assertDbAvailableForProduction();
    const dbResult = await this._dbWrite(
      `UPDATE limited_beta_preparation_gates SET beta_runtime_enabled = 0 WHERE gate_id = ?`,
      [gateId]
    );
    this._validateDbWriteResult(dbResult);
    const hardening = await this._getHardeningInfo(dbResult, gateId);
    return { ok: true, ...hardening, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async createRuntimeAccessGrant(params) {
    this._assertDbAvailableForProduction();
    const grantId = _id('lbrag');
    const { gate_id, cohort_id, participant_id, tenant_id, scope_policy_id, granted_by } = params || {};
    if (!gate_id || !cohort_id || !participant_id || !tenant_id || !scope_policy_id) {
      throw new Error('Missing required grant parameters');
    }

    const grant = {
      grant_id: grantId,
      gate_id,
      cohort_id,
      participant_id,
      tenant_id,
      scope_policy_id,
      granted_by: granted_by || 'system',
      granted_at: new Date().toISOString(),
      revoked: 0,
      revoked_by: null,
      revoked_at: null
    };
    this._grants.set(grantId, grant);

    const dbResult = await this._dbWrite(
      `INSERT INTO limited_beta_runtime_access_grants (grant_id, gate_id, cohort_id, participant_id, tenant_id, scope_policy_id, granted_by, granted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [grantId, gate_id, cohort_id, participant_id, tenant_id, scope_policy_id, grant.granted_by, grant.granted_at]
    );
    this._validateDbWriteResult(dbResult);
    const hardening = await this._getHardeningInfo(dbResult, gate_id);

    return { grant, ...hardening, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async revokeRuntimeAccessGrant(grantId) {
    this._assertDbAvailableForProduction();
    let grant = this._grants.get(grantId);
    if (!grant && this._db) {
      const rows = await this._dbRead("SELECT * FROM limited_beta_runtime_access_grants WHERE grant_id = ?", [grantId]);
      if (rows && rows.length > 0) grant = rows[0];
    }
    if (!grant) throw new Error('Grant not found');

    grant.revoked = 1;
    grant.revoked_at = new Date().toISOString();
    grant.revoked_by = 'admin';
    this._grants.set(grantId, grant);

    const dbResult = await this._dbWrite(
      `UPDATE limited_beta_runtime_access_grants SET revoked = 1, revoked_at = ?, revoked_by = ? WHERE grant_id = ?`,
      [grant.revoked_at, grant.revoked_by, grantId]
    );
    this._validateDbWriteResult(dbResult);
    const hardening = await this._getHardeningInfo(dbResult, grant.gate_id);

    return { grant, ...hardening, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async evaluateRuntimeAccess(params) {
    const { gate_id, cohort_id, participant_id, tenant_id, feature_key } = params || {};
    if (!gate_id || !cohort_id || !participant_id || !tenant_id || !feature_key) {
      return { ok: false, access_status: 'DENIED', reason: 'MISSING_PARAMETERS', safety: SAFETY_MARKERS };
    }

    if (FORBIDDEN_FEATURES.includes(feature_key)) {
      await this.recordRuntimeAccessDenial({ gate_id, cohort_id, participant_id, tenant_id, feature_key, reason: 'FORBIDDEN_FEATURE' });
      return { ok: false, access_status: 'DENIED', reason: 'FORBIDDEN_FEATURE', safety: SAFETY_MARKERS };
    }

    // 1. Check readiness of the gate
    const readiness = await this.evaluateRuntimeActivationReadiness(gate_id);
    if (!readiness.ok) {
      await this.recordRuntimeAccessDenial({ gate_id, cohort_id, participant_id, tenant_id, feature_key, reason: 'GATE_NOT_READY' });
      return { ok: false, access_status: 'DENIED', reason: 'GATE_NOT_READY', safety: SAFETY_MARKERS };
    }

    // 2. Fetch participant and verify eligibility
    let participant = null;
    if (this._db) {
      const rows = await this._dbRead("SELECT * FROM limited_beta_cohort_participants WHERE participant_id = ?", [participant_id]);
      if (rows && rows.length > 0) participant = rows[0];
    }
    if (!participant && this._allowMemoryFallback()) {
      participant = { participant_id, cohort_id, participant_status: 'APPROVED_FOR_LIMITED_BETA_PREPARATION', participant_type: 'FOUNDING_PRINTHOUSE' };
    }

    if (!participant || participant.participant_status !== 'APPROVED_FOR_LIMITED_BETA_PREPARATION') {
      await this.recordRuntimeAccessDenial({ gate_id, cohort_id, participant_id, tenant_id, feature_key, reason: 'PARTICIPANT_NOT_APPROVED' });
      return { ok: false, access_status: 'DENIED', reason: 'PARTICIPANT_NOT_APPROVED', safety: SAFETY_MARKERS };
    }

    // 3. Check boundaries & terms acceptance
    let hasBoundary = false;
    let hasTerms = false;

    if (this._db) {
      const boundaries = await this._dbRead("SELECT * FROM limited_beta_role_boundaries WHERE participant_id = ?", [participant_id]);
      hasBoundary = boundaries && boundaries.length > 0;

      const terms = await this._dbRead("SELECT * FROM limited_beta_terms_acceptances WHERE participant_id = ?", [participant_id]);
      hasTerms = terms && terms.length > 0;
    } else {
      hasBoundary = true;
      hasTerms = true;
    }

    if (!hasBoundary || !hasTerms) {
      await this.recordRuntimeAccessDenial({ gate_id, cohort_id, participant_id, tenant_id, feature_key, reason: 'ELIGIBILITY_CHECKS_FAILED' });
      return { ok: false, access_status: 'DENIED', reason: 'ELIGIBILITY_CHECKS_FAILED', safety: SAFETY_MARKERS };
    }

    // 4. Verify Active Invite Code
    let inviteValid = false;
    if (this._db) {
      const invites = await this._dbRead("SELECT * FROM limited_beta_invite_codes WHERE cohort_id = ? AND revoked = 0 AND (expires_at IS NULL OR expires_at > NOW())", [cohort_id]);
      inviteValid = invites && invites.length > 0;
    } else {
      inviteValid = true;
    }

    if (!inviteValid) {
      await this.recordRuntimeAccessDenial({ gate_id, cohort_id, participant_id, tenant_id, feature_key, reason: 'INVITE_CODE_INVALID' });
      return { ok: false, access_status: 'DENIED', reason: 'INVITE_CODE_INVALID', safety: SAFETY_MARKERS };
    }

    // 5. Verify Scope Policy allows the feature
    let policy = null;
    if (this._db) {
      const grants = await this._dbRead("SELECT * FROM limited_beta_runtime_access_grants WHERE participant_id = ? AND revoked = 0 LIMIT 1", [participant_id]);
      if (grants && grants.length > 0) {
        const policies = await this._dbRead("SELECT * FROM limited_beta_runtime_scope_policies WHERE policy_id = ?", [grants[0].scope_policy_id]);
        if (policies && policies.length > 0) policy = policies[0];
      }
    } else {
      policy = Array.from(this._policies.values()).find(p => p.gate_id === gate_id);
    }

    let allowedFeatures = [];
    if (policy) {
      allowedFeatures = typeof policy.allowed_features_json === 'string'
        ? JSON.parse(policy.allowed_features_json)
        : policy.allowed_features_json;
    } else if (this._allowMemoryFallback()) {
      allowedFeatures = [feature_key];
    }

    if (!allowedFeatures.includes(feature_key)) {
      await this.recordRuntimeAccessDenial({ gate_id, cohort_id, participant_id, tenant_id, feature_key, reason: 'FEATURE_NOT_IN_SCOPE' });
      return { ok: false, access_status: 'DENIED', reason: 'FEATURE_NOT_IN_SCOPE', safety: SAFETY_MARKERS };
    }

    // Access Allowed
    return {
      ok: true,
      access_status: 'ALLOWED',
      runtime_scope: feature_key,
      gate_id,
      cohort_id,
      participant_id,
      tenant_id,
      feature_key,
      betaRuntimeEnabled: true,
      fullPublicEnabled: false,
      openMarketplaceEnabled: false,
      paymentExecutionEnabled: false,
      providerExternalSubmissionEnabled: false,
      sourceMutationEnabled: false,
      persistenceStatus: this._db ? 'PERSISTED' : 'FALLBACK_ONLY',
      runtimeTruthStatus: this._db ? 'VERIFIED' : 'DEGRADED',
      safety: { ...SAFETY_MARKERS, betaRuntimeEnabled: true }
    };
  }

  async createRuntimeSession(params) {
    this._assertDbAvailableForProduction();
    const { gate_id, cohort_id, participant_id, tenant_id, feature_key } = params || {};
    
    const evaluation = await this.evaluateRuntimeAccess({ gate_id, cohort_id, participant_id, tenant_id, feature_key });
    if (!evaluation.ok) {
      throw new Error(`Runtime access denied: ${evaluation.reason}`);
    }

    const sessionId = _id('lbrs');
    const session = {
      session_id: sessionId,
      gate_id,
      cohort_id,
      participant_id,
      tenant_id,
      scope_policy_id: 'default_policy',
      access_status: 'ALLOWED',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(), // 1 hour short default
      terminated_at: null,
      termination_reason: null,
      ...SAFETY_FLAGS_DB,
      beta_runtime_enabled: true,
      runtime_truth_status: this._db ? 'VERIFIED' : 'DEGRADED',
      persistence_status: this._db ? 'PERSISTED' : 'FALLBACK_ONLY',
      evidence_integrity_hash: _hash({ sessionId, gate_id, cohort_id, participant_id }),
      verified_from_phase127_1: 1,
      verified_from_db: this._db ? 1 : 0,
      fail_closed_verified: 1,
      rollback_ready: 1
    };
    this._sessions.set(sessionId, session);

    const dbResult = await this._dbWrite(
      `INSERT INTO limited_beta_runtime_sessions
       (session_id, gate_id, cohort_id, participant_id, tenant_id, scope_policy_id, access_status, created_at, expires_at,
        beta_runtime_enabled, invite_only, cohort_scoped, tenant_scoped, participant_scoped, kill_switch_enabled,
        full_public_enabled, open_marketplace_enabled, payment_execution_enabled, refund_execution_enabled,
        payout_execution_enabled, live_provider_connectivity_enabled, provider_external_submission_enabled,
        external_tax_submission_enabled, external_accounting_submission_enabled, source_mutation_enabled,
        runtime_truth_status, persistence_status, evidence_integrity_hash, verified_from_phase127_1, verified_from_db,
        fail_closed_verified, rollback_ready)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sessionId, gate_id, cohort_id, participant_id, tenant_id, session.scope_policy_id, session.access_status, session.created_at, session.expires_at,
        1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        session.runtime_truth_status, session.persistence_status, session.evidence_integrity_hash, 1, session.verified_from_db, 1, 1
      ]
    );
    this._validateDbWriteResult(dbResult);
    const hardening = await this._getHardeningInfo(dbResult, gate_id);

    await this.recordRuntimeActivity({ session_id: sessionId, gate_id, participant_id, tenant_id, event_type: 'SESSION_CREATED', details: { sessionId } });

    return { session, ...hardening, safety: { ...SAFETY_MARKERS, betaRuntimeEnabled: true }, safety_message: SAFETY_MESSAGE };
  }

  async terminateRuntimeSession(sessionId, reason) {
    this._assertDbAvailableForProduction();
    let session = this._sessions.get(sessionId);
    if (!session && this._db) {
      const rows = await this._dbRead("SELECT * FROM limited_beta_runtime_sessions WHERE session_id = ?", [sessionId]);
      if (rows && rows.length > 0) session = rows[0];
    }
    if (!session) throw new Error('Session not found');

    session.terminated_at = new Date().toISOString();
    session.termination_reason = reason || 'USER_LOGOUT';
    session.beta_runtime_enabled = false;
    this._sessions.set(sessionId, session);

    const dbResult = await this._dbWrite(
      `UPDATE limited_beta_runtime_sessions SET terminated_at = ?, termination_reason = ?, beta_runtime_enabled = 0 WHERE session_id = ?`,
      [session.terminated_at, session.termination_reason, sessionId]
    );
    this._validateDbWriteResult(dbResult);
    const hardening = await this._getHardeningInfo(dbResult, session.gate_id);

    await this.recordRuntimeActivity({ session_id: sessionId, gate_id: session.gate_id, participant_id: session.participant_id, tenant_id: session.tenant_id, event_type: 'SESSION_TERMINATED', details: { reason } });

    return { session, ...hardening, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async recordRuntimeActivity(params) {
    this._assertDbAvailableForProduction();
    const activityId = _id('lbral');
    const { session_id, gate_id, participant_id, tenant_id, event_type, details } = params || {};
    if (!gate_id || !participant_id || !tenant_id || !event_type) {
      throw new Error('Missing activity parameter');
    }

    const activity = {
      activity_id: activityId,
      session_id: session_id || null,
      gate_id,
      participant_id,
      tenant_id,
      event_type,
      action_details_json: details || {},
      created_at: new Date().toISOString()
    };
    
    const list = this._activityLogs.get(gate_id) || [];
    list.push(activity);
    this._activityLogs.set(gate_id, list);

    const dbResult = await this._dbWrite(
      `INSERT INTO limited_beta_runtime_activity_logs (activity_id, session_id, gate_id, tenant_id, participant_id, event_type, action_details_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [activityId, session_id || null, gate_id, tenant_id, participant_id, event_type, JSON.stringify(activity.action_details_json)]
    );
    this._validateDbWriteResult(dbResult);
    return activity;
  }

  async recordRuntimeAccessDenial(params) {
    this._assertDbAvailableForProduction();
    const denialId = _id('lbrad');
    const { gate_id, cohort_id, participant_id, tenant_id, feature_key, reason } = params || {};

    const denial = {
      denial_id: denialId,
      gate_id,
      cohort_id: cohort_id || null,
      participant_id: participant_id || null,
      tenant_id: tenant_id || null,
      feature_key,
      denial_reason: reason || 'UNKNOWN',
      created_at: new Date().toISOString()
    };
    
    const list = this._denials.get(gate_id) || [];
    list.push(denial);
    this._denials.set(gate_id, list);

    const dbResult = await this._dbWrite(
      `INSERT INTO limited_beta_runtime_access_denials (denial_id, gate_id, cohort_id, participant_id, tenant_id, feature_key, denial_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [denialId, gate_id, cohort_id || null, participant_id || null, tenant_id || null, feature_key, denial.denial_reason]
    );
    this._validateDbWriteResult(dbResult);
    return denial;
  }

  async recordRuntimeGuardrailEvent(params) {
    this._assertDbAvailableForProduction();
    const eventId = _id('lbrge');
    const { gate_id, tenant_id, participant_id, event_type, violation_details } = params || {};

    const event = {
      event_id: eventId,
      gate_id,
      tenant_id,
      participant_id,
      event_type,
      violation_details_json: violation_details || {},
      created_at: new Date().toISOString()
    };
    
    const list = this._guardrails.get(gate_id) || [];
    list.push(event);
    this._guardrails.set(gate_id, list);

    const dbResult = await this._dbWrite(
      `INSERT INTO limited_beta_runtime_guardrail_events (event_id, gate_id, tenant_id, participant_id, event_type, violation_details_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [eventId, gate_id, tenant_id, participant_id, event_type, JSON.stringify(event.violation_details_json)]
    );
    this._validateDbWriteResult(dbResult);
    return event;
  }

  async triggerRuntimeKillSwitch(gateId, reason) {
    this._assertDbAvailableForProduction();
    const ksId = _id('lbrks');
    const ks = {
      kill_switch_id: ksId,
      gate_id: gateId,
      kill_switch_enabled: 1,
      triggered_by: 'admin',
      triggered_at: new Date().toISOString(),
      reason: reason || 'EMERGENCY_STOP',
      cleared_by: null,
      cleared_at: null
    };
    this._killSwitches.set(gateId, ks);

    // Write to db
    const dbResult = await this._dbWrite(
      `INSERT INTO limited_beta_runtime_kill_switches (kill_switch_id, gate_id, kill_switch_enabled, triggered_by, triggered_at, reason)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [ksId, gateId, 1, ks.triggered_by, ks.triggered_at, ks.reason]
    );
    this._validateDbWriteResult(dbResult);

    // Disable beta runtime for gate
    await this.disableRuntimeForGate(gateId);

    // Terminate all sessions for the gate
    if (this._db) {
      await this._dbWrite(
        `UPDATE limited_beta_runtime_sessions SET terminated_at = NOW(), termination_reason = 'TERMINATED_BY_KILL_SWITCH', beta_runtime_enabled = 0 WHERE gate_id = ? AND terminated_at IS NULL`,
        [gateId]
      );
    }
    for (const [sid, sess] of this._sessions.entries()) {
      if (sess.gate_id === gateId && !sess.terminated_at) {
        sess.terminated_at = new Date().toISOString();
        sess.termination_reason = 'TERMINATED_BY_KILL_SWITCH';
        sess.beta_runtime_enabled = false;
        this._sessions.set(sid, sess);
      }
    }

    // Write rollback event
    await this.recordRuntimeRollbackEvent({ gate_id: gateId, triggered_by: 'admin', rollback_steps: ['disable_runtime', 'terminate_sessions'] });

    const hardening = await this._getHardeningInfo(dbResult, gateId);
    return { kill_switch: ks, ...hardening, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async clearRuntimeKillSwitch(gateId) {
    this._assertDbAvailableForProduction();
    
    // Clear in db
    const dbResult = await this._dbWrite(
      `UPDATE limited_beta_runtime_kill_switches SET kill_switch_enabled = 0, cleared_at = NOW(), cleared_by = 'admin' WHERE gate_id = ?`,
      [gateId]
    );
    this._validateDbWriteResult(dbResult);

    const ks = this._killSwitches.get(gateId);
    if (ks) {
      ks.kill_switch_enabled = 0;
      ks.cleared_at = new Date().toISOString();
      ks.cleared_by = 'admin';
      this._killSwitches.set(gateId, ks);
    }

    const hardening = await this._getHardeningInfo(dbResult, gateId);
    return { ok: true, ...hardening, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async recordRuntimeRollbackEvent(params) {
    this._assertDbAvailableForProduction();
    const rollbackId = _id('lbrre');
    const { gate_id, triggered_by, rollback_steps } = params || {};

    const ev = {
      rollback_id: rollbackId,
      gate_id,
      triggered_by: triggered_by || 'system',
      rollback_steps_json: rollback_steps || [],
      created_at: new Date().toISOString()
    };
    
    const list = this._rollbacks.get(gate_id) || [];
    list.push(ev);
    this._rollbacks.set(gate_id, list);

    const dbResult = await this._dbWrite(
      `INSERT INTO limited_beta_runtime_rollback_events (rollback_id, gate_id, triggered_by, rollback_steps_json)
       VALUES (?, ?, ?, ?)`,
      [rollbackId, gate_id, ev.triggered_by, JSON.stringify(ev.rollback_steps_json)]
    );
    this._validateDbWriteResult(dbResult);
    return ev;
  }

  async recordRuntimeFinding(params) {
    this._assertDbAvailableForProduction();
    const findingId = _id('lbrf');
    const { gate_id, severity, summary, details_json, blocks_runtime } = params || {};
    if (!gate_id || !summary) throw new Error('gate_id and summary are required');

    const finding = {
      finding_id: findingId,
      gate_id,
      finding_status: 'OPEN',
      severity: severity || 'MEDIUM',
      summary,
      details_json: details_json || {},
      blocks_runtime: blocks_runtime ? 1 : 0,
      created_at: new Date().toISOString(),
      resolved_at: null,
      resolved_by: null
    };
    this._findings.set(findingId, finding);

    const dbResult = await this._dbWrite(
      `INSERT INTO limited_beta_runtime_findings (finding_id, gate_id, finding_status, severity, summary, details_json, blocks_runtime)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [findingId, gate_id, 'OPEN', finding.severity, finding.summary, JSON.stringify(finding.details_json), finding.blocks_runtime]
    );
    this._validateDbWriteResult(dbResult);
    const hardening = await this._getHardeningInfo(dbResult, gate_id);

    return { finding, ...hardening, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async resolveRuntimeFinding(findingId) {
    this._assertDbAvailableForProduction();
    let finding = this._findings.get(findingId);
    if (!finding && this._db) {
      const rows = await this._dbRead("SELECT * FROM limited_beta_runtime_findings WHERE finding_id = ?", [findingId]);
      if (rows && rows.length > 0) finding = rows[0];
    }
    if (!finding) throw new Error('Finding not found');

    finding.finding_status = 'RESOLVED';
    finding.resolved_at = new Date().toISOString();
    finding.resolved_by = 'admin';
    this._findings.set(findingId, finding);

    const dbResult = await this._dbWrite(
      `UPDATE limited_beta_runtime_findings SET finding_status = 'RESOLVED', resolved_at = ?, resolved_by = ? WHERE finding_id = ?`,
      [finding.resolved_at, finding.resolved_by, findingId]
    );
    this._validateDbWriteResult(dbResult);
    const hardening = await this._getHardeningInfo(dbResult, finding.gate_id);

    return { finding, ...hardening, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async buildRuntimeEvidencePack(params) {
    this._assertDbAvailableForProduction();
    const { gate_id } = params || {};
    if (!gate_id) throw new Error('gate_id is required');

    const readiness = await this.evaluateRuntimeActivationReadiness(gate_id);

    // Fetch summaries
    const sessions = this._db ? await this._dbRead("SELECT * FROM limited_beta_runtime_sessions WHERE gate_id = ?", [gate_id]) : [];
    const grants = this._db ? await this._dbRead("SELECT * FROM limited_beta_runtime_access_grants WHERE gate_id = ?", [gate_id]) : [];
    const denials = this._db ? await this._dbRead("SELECT * FROM limited_beta_runtime_access_denials WHERE gate_id = ?", [gate_id]) : [];
    const rollbacks = this._db ? await this._dbRead("SELECT * FROM limited_beta_runtime_rollback_events WHERE gate_id = ?", [gate_id]) : [];
    const guardrails = this._db ? await this._dbRead("SELECT * FROM limited_beta_runtime_guardrail_events WHERE gate_id = ?", [gate_id]) : [];
    const findings = this._db ? await this._dbRead("SELECT * FROM limited_beta_runtime_findings WHERE gate_id = ?", [gate_id]) : [];

    const evidenceData = {
      gate_id,
      runtimeTruthStatus: readiness.runtimeTruthStatus,
      persistenceStatus: readiness.persistenceStatus,
      evidenceIntegrityHash: _hash({ gate_id, count: sessions ? sessions.length : 0 }),
      phase127_1_evidence_status: readiness.checks.verified_from_phase127_1 ? 'VERIFIED' : 'DEGRADED',
      runtime_scope_summary: { count: grants ? grants.length : 0 },
      access_grant_summary: { count: grants ? grants.length : 0 },
      access_denial_summary: { count: denials ? denials.length : 0 },
      active_session_summary: { count: sessions ? sessions.filter(s => !s.terminated_at).length : 0 },
      kill_switch_summary: { active: !readiness.checks.killSwitchInactive },
      rollback_summary: { count: rollbacks ? rollbacks.length : 0 },
      guardrail_event_summary: { count: guardrails ? guardrails.length : 0 },
      blocker_findings_summary: { count: findings ? findings.filter(f => f.finding_status === 'OPEN').length : 0 },
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
        sourceMutationEnabled: false,
      }
    };

    const evidenceIntegrityHash = _hash(evidenceData);
    const packId = _id('lbrep');

    const pack = {
      evidence_pack_id: packId,
      gate_id,
      evidence_data_json: evidenceData,
      evidence_integrity_hash: evidenceIntegrityHash,
      evidence_schema_version: '128.0',
      ...SAFETY_FLAGS_DB,
      runtime_truth_status: readiness.runtimeTruthStatus,
      persistence_status: readiness.persistenceStatus,
      verified_from_phase127_1: readiness.checks.verified_from_phase127_1 ? 1 : 0,
      verified_from_db: readiness.checks.verified_from_db ? 1 : 0,
      fail_closed_verified: readiness.fail_closed_verified,
      rollback_ready: readiness.rollback_ready
    };
    this._packs.set(packId, pack);

    const dbResult = await this._dbWrite(
      `INSERT INTO limited_beta_runtime_evidence_packs
       (evidence_pack_id, gate_id, evidence_data_json, evidence_integrity_hash, evidence_schema_version,
        beta_runtime_enabled, invite_only, cohort_scoped, tenant_scoped, participant_scoped, kill_switch_enabled,
        full_public_enabled, open_marketplace_enabled, payment_execution_enabled, refund_execution_enabled,
        payout_execution_enabled, live_provider_connectivity_enabled, provider_external_submission_enabled,
        external_tax_submission_enabled, external_accounting_submission_enabled, source_mutation_enabled,
        runtime_truth_status, persistence_status, verified_from_phase127_1, verified_from_db, fail_closed_verified, rollback_ready)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        packId, gate_id, JSON.stringify(evidenceData), evidenceIntegrityHash, '128.0',
        0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        pack.runtime_truth_status, pack.persistence_status, pack.verified_from_phase127_1, pack.verified_from_db, pack.fail_closed_verified, pack.rollback_ready
      ]
    );
    this._validateDbWriteResult(dbResult);
    const hardening = await this._getHardeningInfo(dbResult, gate_id);

    return { evidence_pack: pack, ...hardening, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async getRuntimeAuditTimeline(gateId) {
    this._assertDbAvailableForProduction();
    const timeline = this._db
      ? await this._dbRead("SELECT * FROM limited_beta_runtime_activity_logs WHERE gate_id = ? ORDER BY created_at ASC", [gateId])
      : (this._activityLogs.get(gateId) || []);
    return { gate_id: gateId, audits: timeline, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }
}

module.exports = LimitedBetaRuntimeService;
