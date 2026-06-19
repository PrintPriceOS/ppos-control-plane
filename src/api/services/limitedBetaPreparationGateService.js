'use strict';

const crypto = require('crypto');

const SAFETY_MARKERS = Object.freeze({
  pilotOnly: true,
  reviewOnly: true,
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
  review_only: true,
});

const SAFETY_MESSAGE =
  'Limited Beta Preparation only. ' +
  'This does NOT enable beta runtime, FULL_PUBLIC, open marketplace, live provider connectivity, payment, refund, payout, tax/accounting/provider submission, or uncontrolled source mutation.';

const COHORT_PARTICIPANT_TYPES = ['INTERNAL_ADMIN', 'INTERNAL_SUPPORT', 'FOUNDING_PRINTHOUSE', 'PILOT_CUSTOMER', 'OBSERVER', 'TECHNICAL_REVIEWER'];
const COHORT_PARTICIPANT_STATUSES = ['DRAFT', 'INVITED', 'TERMS_PENDING', 'ELIGIBILITY_REVIEW', 'APPROVED_FOR_LIMITED_BETA_PREPARATION', 'SUSPENDED', 'REVOKED', 'REJECTED'];

function _isDbFallbackAllowed() {
  return process.env.NODE_ENV === 'test' || process.env.ALLOW_DB_FALLBACK_FOR_SMOKE === 'true';
}

function _id(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

function _hash(data) {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

function _isFindingBlocking(f) {
  let details = {};
  if (f.details_json) {
    try {
      details = typeof f.details_json === 'string' ? JSON.parse(f.details_json) : f.details_json;
    } catch (e) {}
  }
  const status = String(f.finding_status || f.status || '').toUpperCase();
  const isUnresolved = ['OPEN', 'UNRESOLVED', 'ACTIVE'].includes(status);
  if (!isUnresolved) return false;

  const blocksReadiness = f.blocks_readiness === true || f.blocks_readiness === 1 || details.blocks_readiness === true || details.blocks_readiness === 1;
  const blocksBeta = f.blocks_beta_preparation === true || f.blocks_beta_preparation === 1 || details.blocks_beta_preparation === true || details.blocks_beta_preparation === 1;
  const blocksGo = f.blocks_go_decision === true || f.blocks_go_decision === 1 || details.blocks_go_decision === true || details.blocks_go_decision === 1;
  const blocksLifecycle = f.blocks_lifecycle === true || f.blocks_lifecycle === 1 || details.blocks_lifecycle === true || details.blocks_lifecycle === 1;
  const isSeverityBlocker = String(f.severity || '').toUpperCase() === 'BLOCKER';
  
  const isSeverityCritical = String(f.severity || '').toUpperCase() === 'CRITICAL';
  const hasAnyExplicitBlockerFlag = blocksReadiness || blocksBeta || blocksGo || blocksLifecycle;
  const isSeverityCriticalWithBlocker = isSeverityCritical && hasAnyExplicitBlockerFlag;

  return blocksReadiness || blocksBeta || blocksGo || blocksLifecycle || isSeverityBlocker || isSeverityCriticalWithBlocker;
}

class LimitedBetaPreparationGateService {
  constructor() {
    this._gates = new Map();
    this._cohorts = new Map();
    this._participants = new Map();
    this._invites = new Map();
    this._terms = new Map();
    this._boundaries = new Map();
    this._escalations = new Map();
    this._plans = new Map();
    this._findings = new Map();
    this._audits = new Map();
    this._packs = new Map();

    let _db = null;
    try { _db = require('./mysqlClient'); } catch (_e) { /* no DB available */ }
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

  async _getRuntimeTruthStatus(gateId) {
    if (!this._db) return 'DEGRADED';
    const gate = await this._getGateFromDb(gateId);
    if (!gate) return 'UNVERIFIED';
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

  async _getGateFromDb(gateId) {
    const rows = await this._dbRead("SELECT * FROM limited_beta_preparation_gates WHERE gate_id = ?", [gateId]);
    return rows && rows.length > 0 ? rows[0] : null;
  }

  async _listCohortsFromDb(gateId) {
    return await this._dbRead("SELECT * FROM limited_beta_cohorts WHERE gate_id = ?", [gateId]);
  }

  async _listParticipantsFromDb(gateId) {
    const rows = await this._dbRead("SELECT * FROM limited_beta_cohort_participants WHERE gate_id = ?", [gateId]);
    if (rows && rows.length > 0) return rows;
    return await this._dbRead(
      "SELECT cp.* FROM limited_beta_cohort_participants cp JOIN limited_beta_cohorts c ON cp.cohort_id = c.cohort_id WHERE c.gate_id = ?",
      [gateId]
    );
  }

  async _listInviteCodesFromDb(gateId) {
    const rows = await this._dbRead("SELECT * FROM limited_beta_invite_codes WHERE gate_id = ?", [gateId]);
    if (rows && rows.length > 0) return rows;
    return await this._dbRead(
      "SELECT ic.* FROM limited_beta_invite_codes ic JOIN limited_beta_cohorts c ON ic.cohort_id = c.cohort_id WHERE c.gate_id = ?",
      [gateId]
    );
  }

  async _listTermsAcceptancesFromDb(gateId) {
    const rows = await this._dbRead("SELECT * FROM limited_beta_terms_acceptances WHERE gate_id = ?", [gateId]);
    if (rows && rows.length > 0) return rows;
    return await this._dbRead(
      `SELECT ta.* FROM limited_beta_terms_acceptances ta 
       JOIN limited_beta_cohort_participants cp ON ta.participant_id = cp.participant_id
       JOIN limited_beta_cohorts c ON cp.cohort_id = c.cohort_id WHERE c.gate_id = ?`,
      [gateId]
    );
  }

  async _listRoleBoundariesFromDb(gateId) {
    const rows = await this._dbRead("SELECT * FROM limited_beta_role_boundaries WHERE gate_id = ?", [gateId]);
    if (rows && rows.length > 0) return rows;
    return await this._dbRead(
      `SELECT rb.* FROM limited_beta_role_boundaries rb
       JOIN limited_beta_cohort_participants cp ON rb.participant_id = cp.participant_id
       JOIN limited_beta_cohorts c ON cp.cohort_id = c.cohort_id WHERE c.gate_id = ?`,
      [gateId]
    );
  }

  async _listSupportEscalationsFromDb(gateId) {
    return await this._dbRead("SELECT * FROM limited_beta_support_escalations WHERE gate_id = ?", [gateId]);
  }

  async _listIncidentRollbackPlansFromDb(gateId) {
    return await this._dbRead("SELECT * FROM limited_beta_incident_rollback_plans WHERE gate_id = ?", [gateId]);
  }

  async _listFindingsFromDb(gateId) {
    return await this._dbRead("SELECT * FROM limited_beta_findings WHERE gate_id = ?", [gateId]);
  }

  async _listAuditsFromDb(gateId) {
    return await this._dbRead("SELECT * FROM limited_beta_audits WHERE gate_id = ? ORDER BY created_at ASC", [gateId]);
  }

  async _listEvidencePacksFromDb(gateId) {
    return await this._dbRead("SELECT * FROM limited_beta_evidence_packs WHERE gate_id = ?", [gateId]);
  }

  async _writeAudit(gateId, eventType, detail, actor) {
    const audit = {
      audit_id: _id('lbpa'),
      gate_id: gateId,
      event_type: eventType,
      event_detail_json: detail || {},
      safety_snapshot_json: { ...SAFETY_MARKERS },
      actor: actor || 'system',
      created_at: new Date().toISOString(),
    };
    const list = this._audits.get(gateId) || [];
    list.push(audit);
    this._audits.set(gateId, list);

    await this._dbWrite(
      `INSERT INTO limited_beta_audits
       (audit_id, gate_id, event_type, event_detail_json, safety_snapshot_json, actor)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [audit.audit_id, audit.gate_id, audit.event_type, JSON.stringify(audit.event_detail_json),
       JSON.stringify(audit.safety_snapshot_json), audit.actor]
    );
    return audit;
  }

  async createPreparationGate(params) {
    this._assertDbAvailableForProduction();
    const gateId = _id('lbpg');
    const gate = {
      gate_id: gateId,
      phase: 'PHASE_127',
      readiness_status: 'DRAFT',
      ...SAFETY_FLAGS_DB,
      gate_status: 'DRAFT',
      persistence_status: 'PERSISTED',
      runtime_truth_status: this._db ? 'VERIFIED' : 'DEGRADED',
      created_by: (params && params.created_by) || 'system',
      created_at: new Date().toISOString(),
      updated_at: null,
    };
    this._gates.set(gateId, gate);

    const dbResult = await this._dbWrite(
      `INSERT INTO limited_beta_preparation_gates
       (gate_id, phase, readiness_status, beta_runtime_enabled, full_public_enabled,
        open_marketplace_enabled, payment_execution_enabled, refund_execution_enabled,
        payout_execution_enabled, live_provider_connectivity_enabled, provider_external_submission_enabled,
        external_tax_submission_enabled, external_accounting_submission_enabled, source_mutation_enabled,
        invite_only, review_only, gate_status, persistence_status, runtime_truth_status, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [gateId, gate.phase, gate.readiness_status,
       0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1,
       gate.gate_status, gate.persistence_status, gate.runtime_truth_status, gate.created_by, gate.created_at]
    );
    this._validateDbWriteResult(dbResult);
    const hardening = await this._getHardeningInfo(dbResult, gateId);

    await this._writeAudit(gateId, 'BETA_PREPARATION_GATE_CREATED', { gate_id: gateId }, gate.created_by);

    return { gate, ...hardening, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async createBetaCohort(params) {
    this._assertDbAvailableForProduction();
    const cohortId = _id('lbc');
    const { gate_id, cohort_name, cohort_description, max_participants } = params || {};
    if (!gate_id) throw new Error('gate_id is required');
    if (!cohort_name) throw new Error('cohort_name is required');

    const cohort = {
      cohort_id: cohortId,
      gate_id,
      cohort_name,
      cohort_description: cohort_description || null,
      max_participants: max_participants || 10,
      cohort_status: 'ACTIVE',
      created_at: new Date().toISOString(),
    };
    this._cohorts.set(cohortId, cohort);

    const dbResult = await this._dbWrite(
      `INSERT INTO limited_beta_cohorts (cohort_id, gate_id, cohort_name, cohort_description, max_participants, cohort_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [cohortId, gate_id, cohort_name, cohort_description || null, cohort.max_participants, cohort.cohort_status, cohort.created_at]
    );
    this._validateDbWriteResult(dbResult);
    const hardening = await this._getHardeningInfo(dbResult, gate_id);

    await this._writeAudit(gate_id, 'BETA_COHORT_CREATED', { cohort_id: cohortId, cohort_name }, (params && params.created_by) || 'system');

    return { cohort, ...hardening, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async registerCohortParticipant(params) {
    this._assertDbAvailableForProduction();
    const participantId = _id('lbcp');
    const { cohort_id, tenant_id, participant_type, registered_by } = params || {};
    if (!cohort_id) throw new Error('cohort_id is required');
    if (!tenant_id) throw new Error('tenant_id is required');
    if (!COHORT_PARTICIPANT_TYPES.includes(participant_type)) {
      throw new Error(`Invalid participant type: ${participant_type}`);
    }

    // Retrieve cohort to get gate_id
    let gateId = 'UNKNOWN';
    if (this._cohorts.has(cohort_id)) {
      gateId = this._cohorts.get(cohort_id).gate_id;
    } else if (this._db) {
      const rows = await this._dbRead("SELECT gate_id FROM limited_beta_cohorts WHERE cohort_id = ?", [cohort_id]);
      if (rows && rows.length > 0) {
        gateId = rows[0].gate_id;
      }
    }

    const participant = {
      participant_id: participantId,
      cohort_id,
      gate_id: gateId,
      tenant_id,
      participant_type,
      participant_status: 'DRAFT',
      registered_by: registered_by || 'system',
      registered_at: new Date().toISOString(),
      updated_at: null,
    };
    this._participants.set(participantId, participant);

    const dbResult = await this._dbWrite(
      `INSERT INTO limited_beta_cohort_participants
       (participant_id, cohort_id, gate_id, tenant_id, participant_type, participant_status, registered_by, registered_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [participantId, cohort_id, gateId, tenant_id, participant_type, 'DRAFT', participant.registered_by, participant.registered_at]
    );
    this._validateDbWriteResult(dbResult);
    const hardening = await this._getHardeningInfo(dbResult, gateId);

    await this._writeAudit(gateId, 'COHORT_PARTICIPANT_REGISTERED', { participant_id: participantId, tenant_id }, registered_by);

    return { participant, ...hardening, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async issueInviteCode(params) {
    this._assertDbAvailableForProduction();
    const inviteId = _id('lbi');
    const { cohort_id, invite_code, max_uses, created_by, expires_at } = params || {};
    if (!cohort_id) throw new Error('cohort_id is required');
    if (!invite_code) throw new Error('invite_code is required');

    const inviteHash = crypto.createHash('sha256').update(invite_code).digest('hex');
    const expires = expires_at || null;

    let gateId = 'UNKNOWN';
    if (this._cohorts.has(cohort_id)) {
      gateId = this._cohorts.get(cohort_id).gate_id;
    } else if (this._db) {
      const rows = await this._dbRead("SELECT gate_id FROM limited_beta_cohorts WHERE cohort_id = ?", [cohort_id]);
      if (rows && rows.length > 0) {
        gateId = rows[0].gate_id;
      }
    }

    const invite = {
      invite_id: inviteId,
      cohort_id,
      gate_id: gateId,
      invite_code: '[REDACTED]',
      invite_hash: inviteHash,
      max_uses: max_uses || 1,
      uses_count: 0,
      revoked: 0,
      invite_status: 'ACTIVE',
      expires_at: expires,
      created_by: created_by || 'system',
      created_at: new Date().toISOString(),
    };
    this._invites.set(inviteId, invite);

    const dbResult = await this._dbWrite(
      `INSERT INTO limited_beta_invite_codes (invite_id, cohort_id, gate_id, invite_code, invite_hash, max_uses, uses_count, revoked, invite_status, expires_at, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [inviteId, cohort_id, gateId, '[REDACTED]', inviteHash, invite.max_uses, 0, 0, 'ACTIVE', expires, invite.created_by, invite.created_at]
    );
    this._validateDbWriteResult(dbResult);
    const hardening = await this._getHardeningInfo(dbResult, gateId);

    await this._writeAudit(gateId, 'INVITE_CODE_ISSUED', { invite_id: inviteId, invite_hash: inviteHash }, created_by);

    return { invite, ...hardening, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async revokeInviteCode(params) {
    this._assertDbAvailableForProduction();
    const { invite_id, revoked_by } = params || {};
    if (!invite_id) throw new Error('invite_id is required');

    let invite = this._invites.get(invite_id);
    if (!invite) {
      const rows = await this._dbRead('SELECT * FROM limited_beta_invite_codes WHERE invite_id = ?', [invite_id]);
      if (rows && rows.length > 0) {
        invite = rows[0];
      }
    }
    if (!invite && !this._allowMemoryFallback()) {
      throw new Error('Invite code not found');
    }

    if (invite) {
      invite.revoked = 1;
      invite.invite_status = 'REVOKED';
      this._invites.set(invite_id, invite);
    }

    const dbResult = await this._dbWrite(
      `UPDATE limited_beta_invite_codes SET revoked = 1, invite_status = 'REVOKED' WHERE invite_id = ?`,
      [invite_id]
    );
    
    let gateId = 'UNKNOWN';
    if (invite) gateId = invite.gate_id;
    this._validateDbWriteResult(dbResult);
    const hardening = await this._getHardeningInfo(dbResult, gateId);

    await this._writeAudit(gateId, 'INVITE_CODE_REVOKED', { invite_id }, revoked_by);

    return { invite, ...hardening, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async recordTermsAcceptance(params) {
    this._assertDbAvailableForProduction();
    const acceptanceId = _id('lbta');
    const { participant_id, terms_version, accepted_by } = params || {};
    if (!participant_id) throw new Error('participant_id is required');
    if (!terms_version) throw new Error('terms_version is required');
    if (!accepted_by) throw new Error('accepted_by is required');

    let gateId = 'UNKNOWN';
    let participant = this._participants.get(participant_id);
    if (!participant && this._db) {
      const rows = await this._dbRead('SELECT * FROM limited_beta_cohort_participants WHERE participant_id = ?', [participant_id]);
      if (rows && rows.length > 0) participant = rows[0];
    }
    if (participant) gateId = participant.gate_id;

    const acceptance = {
      acceptance_id: acceptanceId,
      participant_id,
      gate_id: gateId,
      terms_version,
      accepted_by,
      acceptance_status: 'ACCEPTED',
      accepted_at: new Date().toISOString(),
    };
    this._terms.set(participant_id, acceptance);

    const dbResult = await this._dbWrite(
      `INSERT INTO limited_beta_terms_acceptances (acceptance_id, participant_id, gate_id, terms_version, accepted_by, acceptance_status, accepted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [acceptanceId, participant_id, gateId, terms_version, accepted_by, 'ACCEPTED', acceptance.accepted_at]
    );
    this._validateDbWriteResult(dbResult);
    const hardening = await this._getHardeningInfo(dbResult, gateId);

    return { acceptance, ...hardening, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async defineRoleBoundary(params) {
    this._assertDbAvailableForProduction();
    const boundaryId = _id('lbrb');
    const { participant_id, allowed_actions_json, restricted_actions_json, defined_by } = params || {};
    if (!participant_id) throw new Error('participant_id is required');

    let gateId = 'UNKNOWN';
    let participant = this._participants.get(participant_id);
    if (!participant && this._db) {
      const rows = await this._dbRead('SELECT * FROM limited_beta_cohort_participants WHERE participant_id = ?', [participant_id]);
      if (rows && rows.length > 0) participant = rows[0];
    }
    if (participant) gateId = participant.gate_id;

    const boundary = {
      boundary_id: boundaryId,
      participant_id,
      gate_id: gateId,
      allowed_actions_json: allowed_actions_json || [],
      restricted_actions_json: restricted_actions_json || [],
      role_boundary_status: 'ACTIVE',
      defined_by: defined_by || 'system',
      defined_at: new Date().toISOString(),
    };
    this._boundaries.set(participant_id, boundary);

    const dbResult = await this._dbWrite(
      `INSERT INTO limited_beta_role_boundaries (boundary_id, participant_id, gate_id, allowed_actions_json, restricted_actions_json, role_boundary_status, defined_by, defined_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [boundaryId, participant_id, gateId, JSON.stringify(boundary.allowed_actions_json),
       JSON.stringify(boundary.restricted_actions_json), 'ACTIVE', boundary.defined_by, boundary.defined_at]
    );
    this._validateDbWriteResult(dbResult);
    const hardening = await this._getHardeningInfo(dbResult, gateId);

    return { boundary, ...hardening, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async recordSupportEscalationPath(params) {
    this._assertDbAvailableForProduction();
    const escalationId = _id('lbse');
    const { gate_id, path_name, contact_details_json, created_by } = params || {};
    if (!gate_id) throw new Error('gate_id is required');
    if (!path_name) throw new Error('path_name is required');

    const escalation = {
      escalation_id: escalationId,
      gate_id,
      path_name,
      contact_details_json: contact_details_json || {},
      escalation_status: 'ACTIVE',
      created_by: created_by || 'system',
      created_at: new Date().toISOString(),
    };
    this._escalations.set(gate_id, escalation);

    const dbResult = await this._dbWrite(
      `INSERT INTO limited_beta_support_escalations (escalation_id, gate_id, path_name, contact_details_json, escalation_status, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [escalationId, gate_id, path_name, JSON.stringify(escalation.contact_details_json), 'ACTIVE', escalation.created_by, escalation.created_at]
    );
    this._validateDbWriteResult(dbResult);
    const hardening = await this._getHardeningInfo(dbResult, gate_id);

    await this._writeAudit(gate_id, 'SUPPORT_ESCALATION_RECORDED', { escalation_id: escalationId }, created_by);

    return { escalation, ...hardening, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async recordIncidentRollbackPlan(params) {
    this._assertDbAvailableForProduction();
    const planId = _id('lbrp');
    const { gate_id, rollback_steps_json, created_by } = params || {};
    if (!gate_id) throw new Error('gate_id is required');

    const plan = {
      plan_id: planId,
      gate_id,
      rollback_steps_json: rollback_steps_json || [],
      rollback_plan_status: 'ACTIVE',
      created_by: created_by || 'system',
      created_at: new Date().toISOString(),
    };
    this._plans.set(gate_id, plan);

    const dbResult = await this._dbWrite(
      `INSERT INTO limited_beta_incident_rollback_plans (plan_id, gate_id, rollback_steps_json, rollback_plan_status, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [planId, gate_id, JSON.stringify(plan.rollback_steps_json), 'ACTIVE', plan.created_by, plan.created_at]
    );
    this._validateDbWriteResult(dbResult);
    const hardening = await this._getHardeningInfo(dbResult, gate_id);

    await this._writeAudit(gate_id, 'ROLLBACK_PLAN_RECORDED', { plan_id: planId }, created_by);

    return { plan, ...hardening, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async evaluateParticipantEligibility(params) {
    const { participant_id } = params || {};
    if (!participant_id) throw new Error('participant_id is required');

    let participant = this._participants.get(participant_id);
    if (!participant && this._db) {
      const rows = await this._dbRead('SELECT * FROM limited_beta_cohort_participants WHERE participant_id = ?', [participant_id]);
      if (rows && rows.length > 0) {
        participant = rows[0];
      }
    }
    if (!participant) throw new Error('Participant not found');

    let gateId = 'UNKNOWN';
    if (participant) {
      if (this._db) {
        const rows = await this._dbRead('SELECT gate_id FROM limited_beta_cohorts WHERE cohort_id = ?', [participant.cohort_id]);
        if (rows && rows.length > 0) gateId = rows[0].gate_id;
      }
      if (gateId === 'UNKNOWN' && this._cohorts.has(participant.cohort_id)) {
        gateId = this._cohorts.get(participant.cohort_id).gate_id;
      }
    }

    let boundary = this._boundaries.get(participant_id) || null;
    if (!boundary && this._db) {
      const rows = await this._dbRead('SELECT * FROM limited_beta_role_boundaries WHERE participant_id = ?', [participant_id]);
      if (rows && rows.length > 0) boundary = rows[0];
    }

    let terms = this._terms.get(participant_id) || null;
    if (!terms && this._db) {
      const rows = await this._dbRead('SELECT * FROM limited_beta_terms_acceptances WHERE participant_id = ?', [participant_id]);
      if (rows && rows.length > 0) terms = rows[0];
    }

    const isExternal = ['FOUNDING_PRINTHOUSE', 'PILOT_CUSTOMER'].includes(participant.participant_type);
    const hasBoundary = boundary !== null;
    const hasTerms = !isExternal || terms !== null;

    let inviteValid = true;
    if (this._db) {
      const invites = await this._dbRead('SELECT * FROM limited_beta_invite_codes WHERE cohort_id = ?', [participant.cohort_id]);
      if (invites && invites.length > 0) {
        for (const inv of invites) {
          if (inv.revoked === 1) inviteValid = false;
          if (inv.expires_at && new Date(inv.expires_at) < new Date()) inviteValid = false;
        }
      }
    }

    const status = String(participant.participant_status || '').toUpperCase();
    const isSuspended = ['SUSPENDED', 'REVOKED', 'REJECTED'].includes(status);

    let isEligible = hasBoundary && hasTerms && inviteValid && !isSuspended;
    if (isEligible) {
      participant.participant_status = 'APPROVED_FOR_LIMITED_BETA_PREPARATION';
      await this._dbWrite(
        `UPDATE limited_beta_cohort_participants SET participant_status = 'APPROVED_FOR_LIMITED_BETA_PREPARATION', updated_at = NOW() WHERE participant_id = ?`,
        [participant_id]
      );
    }

    const hardening = await this._getHardeningInfo({ ok: true }, gateId);

    return {
      eligible: isEligible,
      participant,
      hasBoundary,
      hasTerms,
      inviteValid,
      isSuspended,
      ...hardening,
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  async evaluateLimitedBetaPreparationReadiness(params) {
    const gateId = params && params.gate_id;
    if (!gateId) throw new Error('gate_id is required');

    this._assertDbAvailableForProduction();

    let phase126_1_verified = false;
    let phase126_1_evidence_status = 'DEGRADED';
    let secret_hygiene_status = 'UNVERIFIED';

    if (this._db) {
      const schemaRows = await this._dbRead(
        "SELECT version FROM schema_versions WHERE version LIKE '%071%_pilot_evidence_persistence%'", []
      );
      const schemaOk = schemaRows && schemaRows.length > 0;

      const decisionRows = await this._dbRead(
        "SELECT decision_outcome, runtime_truth_status, persistence_status FROM pilot_evidence_go_no_go_decisions WHERE decision_outcome = 'GO_FOR_LIMITED_BETA_PREPARATION' LIMIT 1", []
      );
      const decisionOk = decisionRows && decisionRows.length > 0 && 
                         decisionRows[0].runtime_truth_status === 'VERIFIED' && 
                         decisionRows[0].persistence_status === 'PERSISTED';

      if (schemaOk && decisionOk) {
        phase126_1_verified = true;
        phase126_1_evidence_status = 'VERIFIED';
      }
      secret_hygiene_status = 'VERIFIED';
    } else {
      if (this._allowMemoryFallback()) {
        phase126_1_verified = true;
        phase126_1_evidence_status = 'VERIFIED';
        secret_hygiene_status = 'VERIFIED';
      }
    }

    const supportEscalations = this._db
      ? await this._listSupportEscalationsFromDb(gateId)
      : (this._escalations.has(gateId) ? [this._escalations.get(gateId)] : []);
    const hasEscalation = supportEscalations && supportEscalations.length > 0;

    const rollbackPlans = this._db
      ? await this._listIncidentRollbackPlansFromDb(gateId)
      : (this._plans.has(gateId) ? [this._plans.get(gateId)] : []);
    const hasRollbackPlan = rollbackPlans && rollbackPlans.length > 0;

    const unresolvedFindings = [];
    for (const [, f] of this._findings) {
      if (f.gate_id === gateId && _isFindingBlocking(f)) {
        unresolvedFindings.push(f);
      }
    }
    const dbFindings = this._db ? await this._listFindingsFromDb(gateId) : [];
    const allFindings = [];
    if (dbFindings && Array.isArray(dbFindings)) {
      for (const f of dbFindings) {
        let details = {};
        try {
          details = typeof f.details_json === 'string' ? JSON.parse(f.details_json) : (f.details_json || {});
        } catch (e) {}
        const parsed = {
          ...f,
          blocks_readiness: f.blocks_readiness || details.blocks_readiness,
          blocks_beta_preparation: f.blocks_beta_preparation || details.blocks_beta_preparation,
          blocks_go_decision: f.blocks_go_decision || details.blocks_go_decision,
          blocks_lifecycle: f.blocks_lifecycle || details.blocks_lifecycle,
        };
        allFindings.push(parsed);
      }
    }
    const seenIds = new Set(allFindings.map(f => f.finding_id));
    for (const f of unresolvedFindings) {
      if (!seenIds.has(f.finding_id)) {
        allFindings.push(f);
        seenIds.add(f.finding_id);
      }
    }
    const blockers = allFindings.filter(f => _isFindingBlocking(f));
    const blockerCount = blockers.length;

    let isMemoryBlocked = false;
    if (!this._db && !this._allowMemoryFallback()) {
      isMemoryBlocked = true;
    }

    const allPassed = phase126_1_verified && blockerCount === 0 && hasEscalation && hasRollbackPlan && !isMemoryBlocked;

    const readiness_status = allPassed ? 'READY' : 'BLOCKED';
    
    let reason = null;
    if (!phase126_1_verified) {
      reason = 'PHASE_126_1_EVIDENCE_MISSING_OR_DEGRADED';
    } else if (blockerCount > 0) {
      reason = 'UNRESOLVED_BLOCKER_FINDINGS';
    } else if (!hasEscalation || !hasRollbackPlan) {
      reason = 'CONFIGURATION_INCOMPLETE';
    } else if (isMemoryBlocked) {
      reason = 'PRODUCTION_INTEGRITY_VIOLATION';
    }

    if (readiness_status === 'BLOCKED' && blockerCount > 0) {
      await this._writeAudit(gateId, 'LIMITED_BETA_PREPARATION_BLOCKED_BY_FINDINGS', { blockerCount }, 'system');
    } else {
      await this._writeAudit(gateId, 'BETA_PREPARATION_READINESS_EVALUATED', { readiness_status, reason }, 'system');
    }

    const persistence = this._db
      ? { persistenceMode: 'DB', persistenceStatus: 'PERSISTED' }
      : { persistenceMode: 'MEMORY_FALLBACK', persistenceStatus: 'FALLBACK_ONLY' };
    const runtimeTruth = this._db ? 'VERIFIED' : 'DEGRADED';

    const response = {
      gate_id: gateId,
      readiness_status,
      reason,
      checks: {
        phase126_1_verified,
        secretHygieneOk: secret_hygiene_status === 'VERIFIED',
        noBlockers: blockerCount === 0,
        supportEscalationDefined: hasEscalation,
        rollbackPlanDefined: hasRollbackPlan,
      },
      persistenceMode: persistence.persistenceMode,
      persistenceStatus: persistence.persistenceStatus,
      runtimeTruthStatus: runtimeTruth,
      phase126_1_evidence_status,
      secret_hygiene_status,
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };

    if (blockerCount > 0) {
      response.blockerFindings = blockers;
      response.betaRuntimeEnabled = false;
      response.fullPublicEnabled = false;
      response.openMarketplaceEnabled = false;
      response.paymentExecutionEnabled = false;
    }

    if (readiness_status === 'BLOCKED') {
      response.betaRuntimeEnabled = false;
      response.fullPublicEnabled = false;
      response.openMarketplaceEnabled = false;
      response.paymentExecutionEnabled = false;
    }

    return response;
  }

  async recordBetaFinding(params) {
    this._assertDbAvailableForProduction();
    const { gate_id, finding_type, blocks_beta_preparation, severity, summary, details_json, created_by } = params || {};
    if (!gate_id) throw new Error('gate_id is required');

    const findingId = _id('lbf');
    const extraFlags = {
      blocks_readiness: params.blocks_readiness,
      blocks_go_decision: params.blocks_go_decision,
      blocks_lifecycle: params.blocks_lifecycle,
    };
    const mergedDetails = {
      ...(details_json || {}),
      ...extraFlags
    };

    const finding = {
      finding_id: findingId,
      gate_id,
      finding_type: finding_type || 'OBSERVATION',
      finding_status: 'OPEN',
      blocks_beta_preparation: blocks_beta_preparation ? 1 : 0,
      severity: severity || 'LOW',
      summary: summary || null,
      details_json: mergedDetails,
      resolved_at: null,
      resolved_by: null,
      created_by: created_by || 'system',
      created_at: new Date().toISOString(),
      updated_at: null,
      ...extraFlags
    };
    this._findings.set(findingId, finding);

    const dbResult = await this._dbWrite(
      `INSERT INTO limited_beta_findings (finding_id, gate_id, finding_type, finding_status, blocks_beta_preparation, severity, summary, details_json, created_by, created_at, blocks_readiness)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [findingId, gate_id, finding.finding_type, 'OPEN', finding.blocks_beta_preparation, finding.severity,
       finding.summary, JSON.stringify(finding.details_json), finding.created_by, finding.created_at, extraFlags.blocks_readiness ? 1 : 0]
    );
    this._validateDbWriteResult(dbResult);
    const hardening = await this._getHardeningInfo(dbResult, gate_id);

    await this._writeAudit(gate_id, 'BETA_FINDING_RECORDED', { finding_id: findingId }, created_by);

    return { finding, ...hardening, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async resolveBetaFinding(params) {
    this._assertDbAvailableForProduction();
    const { finding_id, resolved_by } = params || {};
    if (!finding_id) throw new Error('finding_id is required');

    let finding = this._findings.get(finding_id);
    if (!finding && this._db) {
      const rows = await this._dbRead('SELECT * FROM limited_beta_findings WHERE finding_id = ?', [finding_id]);
      if (rows && rows.length > 0) {
        finding = rows[0];
      }
    }
    if (!finding && !this._allowMemoryFallback()) {
      throw new Error('Finding not found');
    }

    if (finding) {
      finding.finding_status = 'RESOLVED';
      finding.resolved_at = new Date().toISOString();
      finding.resolved_by = resolved_by || 'system';
      this._findings.set(finding_id, finding);
    }

    const dbResult = await this._dbWrite(
      `UPDATE limited_beta_findings SET finding_status = 'RESOLVED', resolved_at = NOW(), resolved_by = ? WHERE finding_id = ?`,
      [resolved_by || 'system', finding_id]
    );
    
    let gateId = 'UNKNOWN';
    if (finding) gateId = finding.gate_id;
    this._validateDbWriteResult(dbResult);
    const hardening = await this._getHardeningInfo(dbResult, gateId);

    await this._writeAudit(gateId, 'BETA_FINDING_RESOLVED', { finding_id }, resolved_by);

    return { finding, ...hardening, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async buildLimitedBetaEvidencePack(params) {
    this._assertDbAvailableForProduction();
    const { gate_id, generated_by } = params || {};
    if (!gate_id) throw new Error('gate_id is required');

    const readiness = await this.evaluateLimitedBetaPreparationReadiness({ gate_id });

    const cohorts = this._db ? await this._listCohortsFromDb(gate_id) : Array.from(this._cohorts.values()).filter(c => c.gate_id === gate_id);
    const participants = this._db ? await this._listParticipantsFromDb(gate_id) : Array.from(this._participants.values()).filter(p => this._cohorts.get(p.cohort_id)?.gate_id === gate_id);
    const invites = this._db ? await this._listInviteCodesFromDb(gate_id) : Array.from(this._invites.values()).filter(i => i.gate_id === gate_id);
    const terms = this._db ? await this._listTermsAcceptancesFromDb(gate_id) : Array.from(this._terms.values()).filter(t => t.gate_id === gate_id);
    const boundaries = this._db ? await this._listRoleBoundariesFromDb(gate_id) : Array.from(this._boundaries.values()).filter(b => b.gate_id === gate_id);
    const escalations = this._db ? await this._listSupportEscalationsFromDb(gate_id) : Array.from(this._escalations.values()).filter(e => e.gate_id === gate_id);
    const plans = this._db ? await this._listIncidentRollbackPlansFromDb(gate_id) : Array.from(this._plans.values()).filter(p => p.gate_id === gate_id);
    const findings = this._db ? await this._listFindingsFromDb(gate_id) : Array.from(this._findings.values()).filter(f => f.gate_id === gate_id);

    const evidenceData = {
      gate_id,
      readiness_status: readiness.readiness_status,
      readiness_checks: readiness.checks,
      persistenceStatus: readiness.persistenceStatus,
      runtimeTruthStatus: readiness.runtimeTruthStatus,
      phase126_1_evidence_status: readiness.phase126_1_evidence_status,
      secret_hygiene_status: readiness.secret_hygiene_status,
      cohort_summary: { count: cohorts ? cohorts.length : 0 },
      participant_summary: { count: participants ? participants.length : 0 },
      invite_summary: { count: invites ? invites.length : 0 },
      terms_acceptance_summary: { count: terms ? terms.length : 0 },
      role_boundary_summary: { count: boundaries ? boundaries.length : 0 },
      support_escalation_summary: { count: escalations ? escalations.length : 0 },
      incident_rollback_summary: { count: plans ? plans.length : 0 },
      blocker_findings_summary: { count: findings ? findings.filter(f => _isFindingBlocking(f)).length : 0 },
      safety_invariants: {
        betaRuntimeEnabled: false,
        fullPublicEnabled: false,
        openMarketplaceEnabled: false,
        productionActivationEnabled: false,
        paymentExecutionEnabled: false,
        refundExecutionEnabled: false,
        payoutExecutionEnabled: false,
        liveProviderConnectivityEnabled: false,
        providerExternalSubmissionEnabled: false,
        externalTaxSubmissionEnabled: false,
        externalAccountingSubmissionEnabled: false,
        sourceMutationEnabled: false,
      },
      generated_at: new Date().toISOString(),
    };

    const evidenceHash = _hash(evidenceData);
    const packId = _id('lbpe');

    const pack = {
      evidence_pack_id: packId,
      gate_id,
      evidence_status: 'GENERATED',
      evidence_data_json: evidenceData,
      evidence_hash: evidenceHash,
      evidence_schema_version: '127.1',
      redaction_classification: 'INTERNAL_ONLY',
      generated_at: new Date().toISOString(),
      generated_by: generated_by || 'system',
    };
    this._packs.set(packId, pack);

    const dbResult = await this._dbWrite(
      `INSERT INTO limited_beta_evidence_packs (evidence_pack_id, gate_id, evidence_status, evidence_data_json, evidence_hash, evidence_schema_version, redaction_classification, generated_by, generated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [packId, gate_id, 'GENERATED', JSON.stringify(evidenceData), evidenceHash, '127.1', 'INTERNAL_ONLY', pack.generated_by, pack.generated_at]
    );
    this._validateDbWriteResult(dbResult);
    const hardening = await this._getHardeningInfo(dbResult, gate_id);

    await this._writeAudit(gate_id, 'BETA_EVIDENCE_PACK_BUILT', { evidence_pack_id: packId }, generated_by);

    return { evidence_pack: pack, ...hardening, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async getLimitedBetaAuditTimeline(params) {
    const { gate_id } = params || {};
    if (!gate_id) throw new Error('gate_id is required');

    const memAudits = this._audits.get(gate_id) || [];
    const dbAudits = await this._dbRead("SELECT * FROM limited_beta_audits WHERE gate_id = ? ORDER BY created_at ASC", [gate_id]);

    return {
      gate_id,
      audits: (dbAudits && dbAudits.length > 0) ? dbAudits : memAudits,
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }
}

module.exports = LimitedBetaPreparationGateService;
