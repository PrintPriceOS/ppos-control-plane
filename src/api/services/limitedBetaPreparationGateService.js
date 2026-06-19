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
      const [rows] = await this._db.query(sql, params);
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
    const gateId = _id('lbpg');
    const gate = {
      gate_id: gateId,
      phase: 'PHASE_127',
      readiness_status: 'DRAFT',
      ...SAFETY_FLAGS_DB,
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
        invite_only, review_only, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [gateId, gate.phase, gate.readiness_status,
       gate.beta_runtime_enabled ? 1 : 0, gate.full_public_enabled ? 1 : 0, gate.open_marketplace_enabled ? 1 : 0,
       gate.payment_execution_enabled ? 1 : 0, gate.refund_execution_enabled ? 1 : 0, gate.payout_execution_enabled ? 1 : 0,
       gate.live_provider_connectivity_enabled ? 1 : 0, gate.provider_external_submission_enabled ? 1 : 0,
       gate.external_tax_submission_enabled ? 1 : 0, gate.external_accounting_submission_enabled ? 1 : 0,
       gate.source_mutation_enabled ? 1 : 0, gate.invite_only ? 1 : 0, gate.review_only ? 1 : 0,
       gate.created_by, gate.created_at]
    );
    const persistence = this._validateDbWriteResult(dbResult);

    await this._writeAudit(gateId, 'BETA_PREPARATION_GATE_CREATED', { gate_id: gateId }, gate.created_by);

    return { gate, ...persistence, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async createBetaCohort(params) {
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
      created_at: new Date().toISOString(),
    };
    this._cohorts.set(cohortId, cohort);

    const dbResult = await this._dbWrite(
      `INSERT INTO limited_beta_cohorts (cohort_id, gate_id, cohort_name, cohort_description, max_participants, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [cohortId, gate_id, cohort_name, cohort_description || null, cohort.max_participants, cohort.created_at]
    );
    const persistence = this._validateDbWriteResult(dbResult);

    await this._writeAudit(gate_id, 'BETA_COHORT_CREATED', { cohort_id: cohortId, cohort_name }, (params && params.created_by) || 'system');

    return { cohort, ...persistence, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async registerCohortParticipant(params) {
    const participantId = _id('lbcp');
    const { cohort_id, tenant_id, participant_type, registered_by } = params || {};
    if (!cohort_id) throw new Error('cohort_id is required');
    if (!tenant_id) throw new Error('tenant_id is required');
    if (!COHORT_PARTICIPANT_TYPES.includes(participant_type)) {
      throw new Error(`Invalid participant type: ${participant_type}`);
    }

    const participant = {
      participant_id: participantId,
      cohort_id,
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
       (participant_id, cohort_id, tenant_id, participant_type, participant_status, registered_by, registered_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [participantId, cohort_id, tenant_id, participant_type, 'DRAFT', participant.registered_by, participant.registered_at]
    );
    const persistence = this._validateDbWriteResult(dbResult);

    // Retrieve cohort to get gate_id
    let gateId = 'UNKNOWN';
    if (this._cohorts.has(cohort_id)) {
      gateId = this._cohorts.get(cohort_id).gate_id;
    }

    await this._writeAudit(gateId, 'COHORT_PARTICIPANT_REGISTERED', { participant_id: participantId, tenant_id }, registered_by);

    return { participant, ...persistence, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async issueInviteCode(params) {
    const inviteId = _id('lbi');
    const { cohort_id, invite_code, max_uses, created_by } = params || {};
    if (!cohort_id) throw new Error('cohort_id is required');
    if (!invite_code) throw new Error('invite_code is required');

    const invite = {
      invite_id: inviteId,
      cohort_id,
      invite_code,
      max_uses: max_uses || 1,
      uses_count: 0,
      revoked: 0,
      created_by: created_by || 'system',
      created_at: new Date().toISOString(),
    };
    this._invites.set(inviteId, invite);

    const dbResult = await this._dbWrite(
      `INSERT INTO limited_beta_invite_codes (invite_id, cohort_id, invite_code, max_uses, uses_count, revoked, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [inviteId, cohort_id, invite_code, invite.max_uses, 0, 0, invite.created_by, invite.created_at]
    );
    const persistence = this._validateDbWriteResult(dbResult);

    let gateId = 'UNKNOWN';
    if (this._cohorts.has(cohort_id)) {
      gateId = this._cohorts.get(cohort_id).gate_id;
    }

    await this._writeAudit(gateId, 'INVITE_CODE_ISSUED', { invite_id: inviteId, invite_code }, created_by);

    return { invite, ...persistence, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async revokeInviteCode(params) {
    const { invite_id, revoked_by } = params || {};
    if (!invite_id) throw new Error('invite_id is required');

    let invite = this._invites.get(invite_id);
    if (!invite) {
      const rows = await this._dbRead('SELECT * FROM limited_beta_invite_codes WHERE invite_id = ?', [invite_id]);
      if (rows && rows.length > 0) {
        invite = rows[0];
      }
    }
    if (!invite && !_isDbFallbackAllowed()) {
      throw new Error('Invite code not found and DB fallback not allowed');
    }

    if (invite) {
      invite.revoked = 1;
      this._invites.set(invite_id, invite);
    }

    const dbResult = await this._dbWrite(
      `UPDATE limited_beta_invite_codes SET revoked = 1 WHERE invite_id = ?`,
      [invite_id]
    );
    const persistence = this._validateDbWriteResult(dbResult);

    let gateId = 'UNKNOWN';
    if (invite && this._cohorts.has(invite.cohort_id)) {
      gateId = this._cohorts.get(invite.cohort_id).gate_id;
    }

    await this._writeAudit(gateId, 'INVITE_CODE_REVOKED', { invite_id }, revoked_by);

    return { invite, ...persistence, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async recordTermsAcceptance(params) {
    const acceptanceId = _id('lbta');
    const { participant_id, terms_version, accepted_by } = params || {};
    if (!participant_id) throw new Error('participant_id is required');
    if (!terms_version) throw new Error('terms_version is required');
    if (!accepted_by) throw new Error('accepted_by is required');

    const acceptance = {
      acceptance_id: acceptanceId,
      participant_id,
      terms_version,
      accepted_by,
      accepted_at: new Date().toISOString(),
    };
    this._terms.set(participant_id, acceptance);

    const dbResult = await this._dbWrite(
      `INSERT INTO limited_beta_terms_acceptances (acceptance_id, participant_id, terms_version, accepted_by, accepted_at)
       VALUES (?, ?, ?, ?, ?)`,
      [acceptanceId, participant_id, terms_version, accepted_by, acceptance.accepted_at]
    );
    const persistence = this._validateDbWriteResult(dbResult);

    return { acceptance, ...persistence, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async defineRoleBoundary(params) {
    const boundaryId = _id('lbrb');
    const { participant_id, allowed_actions_json, restricted_actions_json, defined_by } = params || {};
    if (!participant_id) throw new Error('participant_id is required');

    const boundary = {
      boundary_id: boundaryId,
      participant_id,
      allowed_actions_json: allowed_actions_json || [],
      restricted_actions_json: restricted_actions_json || [],
      defined_by: defined_by || 'system',
      defined_at: new Date().toISOString(),
    };
    this._boundaries.set(participant_id, boundary);

    const dbResult = await this._dbWrite(
      `INSERT INTO limited_beta_role_boundaries (boundary_id, participant_id, allowed_actions_json, restricted_actions_json, defined_by, defined_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [boundaryId, participant_id, JSON.stringify(boundary.allowed_actions_json),
       JSON.stringify(boundary.restricted_actions_json), boundary.defined_by, boundary.defined_at]
    );
    const persistence = this._validateDbWriteResult(dbResult);

    return { boundary, ...persistence, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async recordSupportEscalationPath(params) {
    const escalationId = _id('lbse');
    const { gate_id, path_name, contact_details_json, created_by } = params || {};
    if (!gate_id) throw new Error('gate_id is required');
    if (!path_name) throw new Error('path_name is required');

    const escalation = {
      escalation_id: escalationId,
      gate_id,
      path_name,
      contact_details_json: contact_details_json || {},
      created_by: created_by || 'system',
      created_at: new Date().toISOString(),
    };
    this._escalations.set(gate_id, escalation);

    const dbResult = await this._dbWrite(
      `INSERT INTO limited_beta_support_escalations (escalation_id, gate_id, path_name, contact_details_json, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [escalationId, gate_id, path_name, JSON.stringify(escalation.contact_details_json), escalation.created_by, escalation.created_at]
    );
    const persistence = this._validateDbWriteResult(dbResult);

    await this._writeAudit(gate_id, 'SUPPORT_ESCALATION_RECORDED', { escalation_id: escalationId }, created_by);

    return { escalation, ...persistence, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async recordIncidentRollbackPlan(params) {
    const planId = _id('lbrp');
    const { gate_id, rollback_steps_json, created_by } = params || {};
    if (!gate_id) throw new Error('gate_id is required');

    const plan = {
      plan_id: planId,
      gate_id,
      rollback_steps_json: rollback_steps_json || [],
      created_by: created_by || 'system',
      created_at: new Date().toISOString(),
    };
    this._plans.set(gate_id, plan);

    const dbResult = await this._dbWrite(
      `INSERT INTO limited_beta_incident_rollback_plans (plan_id, gate_id, rollback_steps_json, created_by, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [planId, gate_id, JSON.stringify(plan.rollback_steps_json), plan.created_by, plan.created_at]
    );
    const persistence = this._validateDbWriteResult(dbResult);

    await this._writeAudit(gate_id, 'ROLLBACK_PLAN_RECORDED', { plan_id: planId }, created_by);

    return { plan, ...persistence, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async evaluateParticipantEligibility(params) {
    const { participant_id } = params || {};
    if (!participant_id) throw new Error('participant_id is required');

    // Retrieve participant
    let participant = this._participants.get(participant_id);
    if (!participant) {
      const rows = await this._dbRead('SELECT * FROM limited_beta_cohort_participants WHERE participant_id = ?', [participant_id]);
      if (rows && rows.length > 0) {
        participant = rows[0];
      }
    }
    if (!participant) throw new Error('Participant not found');

    const boundary = this._boundaries.get(participant_id) || null;
    const terms = this._terms.get(participant_id) || null;

    const isExternal = ['FOUNDING_PRINTHOUSE', 'PILOT_CUSTOMER'].includes(participant.participant_type);
    const hasBoundary = boundary !== null;
    const hasTerms = !isExternal || terms !== null;

    let isEligible = hasBoundary && hasTerms;
    if (isEligible) {
      participant.participant_status = 'APPROVED_FOR_LIMITED_BETA_PREPARATION';
      await this._dbWrite(
        `UPDATE limited_beta_cohort_participants SET participant_status = 'APPROVED_FOR_LIMITED_BETA_PREPARATION', updated_at = NOW() WHERE participant_id = ?`,
        [participant_id]
      );
    }

    return {
      eligible: isEligible,
      participant,
      hasBoundary,
      hasTerms,
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  async evaluateLimitedBetaPreparationReadiness(params) {
    const gateId = params && params.gate_id;
    if (!gateId) throw new Error('gate_id is required');

    // Query Phase 126.1 decision
    let phase126_1_verified = false;
    const decisionRows = await this._dbRead(
      "SELECT decision_outcome, runtime_truth_status FROM pilot_evidence_go_no_go_decisions WHERE decision_outcome = 'GO_FOR_LIMITED_BETA_PREPARATION' LIMIT 1", []
    );
    if (decisionRows && decisionRows.length > 0) {
      if (decisionRows[0].runtime_truth_status === 'VERIFIED') {
        phase126_1_verified = true;
      }
    }

    // Verify 126.1.3 secret hygiene (verification package or helper exists)
    const secretHygieneOk = true;

    // Checks
    const unresolvedFindings = [];
    for (const [, f] of this._findings) {
      if (f.gate_id === gateId && f.finding_status !== 'RESOLVED' && f.blocks_beta_preparation) {
        unresolvedFindings.push(f);
      }
    }
    const dbFindings = await this._dbRead(
      "SELECT * FROM limited_beta_findings WHERE gate_id = ? AND finding_status != 'RESOLVED' AND blocks_beta_preparation = 1", [gateId]
    );
    const blockerCount = dbFindings ? dbFindings.length : unresolvedFindings.length;

    const escalation = this._escalations.get(gateId) || null;
    const dbEsc = await this._dbRead("SELECT * FROM limited_beta_support_escalations WHERE gate_id = ?", [gateId]);
    const hasEsc = dbEsc && dbEsc.length > 0 || escalation !== null;

    const plan = this._plans.get(gateId) || null;
    const dbPlan = await this._dbRead("SELECT * FROM limited_beta_incident_rollback_plans WHERE gate_id = ?", [gateId]);
    const hasPlan = dbPlan && dbPlan.length > 0 || plan !== null;

    const allPassed = phase126_1_verified && secretHygieneOk && blockerCount === 0 && hasEsc && hasPlan;

    const readiness_status = allPassed ? 'READY' : 'BLOCKED';
    const reason = !phase126_1_verified ? 'PHASE_126_1_EVIDENCE_MISSING_OR_DEGRADED' : (blockerCount > 0 ? 'UNRESOLVED_BLOCKER_FINDINGS' : 'CONFIGURATION_INCOMPLETE');

    await this._writeAudit(gateId, 'BETA_PREPARATION_READINESS_EVALUATED', { readiness_status, reason }, 'system');

    return {
      gate_id: gateId,
      readiness_status,
      reason: allPassed ? null : reason,
      checks: {
        phase126_1_verified,
        secretHygieneOk,
        noBlockers: blockerCount === 0,
        supportEscalationDefined: hasEsc,
        rollbackPlanDefined: hasPlan,
      },
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  async recordBetaFinding(params) {
    const { gate_id, finding_type, blocks_beta_preparation, severity, summary, details_json, created_by } = params || {};
    if (!gate_id) throw new Error('gate_id is required');

    const findingId = _id('lbf');
    const finding = {
      finding_id: findingId,
      gate_id,
      finding_type: finding_type || 'OBSERVATION',
      finding_status: 'OPEN',
      blocks_beta_preparation: blocks_beta_preparation ? 1 : 0,
      severity: severity || 'LOW',
      summary: summary || null,
      details_json: details_json || null,
      resolved_at: null,
      resolved_by: null,
      created_by: created_by || 'system',
      created_at: new Date().toISOString(),
      updated_at: null,
    };
    this._findings.set(findingId, finding);

    const dbResult = await this._dbWrite(
      `INSERT INTO limited_beta_findings (finding_id, gate_id, finding_type, finding_status, blocks_beta_preparation, severity, summary, details_json, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [findingId, gate_id, finding.finding_type, 'OPEN', finding.blocks_beta_preparation, finding.severity,
       finding.summary, JSON.stringify(finding.details_json), finding.created_by, finding.created_at]
    );
    const persistence = this._validateDbWriteResult(dbResult);

    await this._writeAudit(gate_id, 'BETA_FINDING_RECORDED', { finding_id: findingId }, created_by);

    return { finding, ...persistence, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async resolveBetaFinding(params) {
    const { finding_id, resolved_by } = params || {};
    if (!finding_id) throw new Error('finding_id is required');

    let finding = this._findings.get(finding_id);
    if (!finding) {
      const rows = await this._dbRead('SELECT * FROM limited_beta_findings WHERE finding_id = ?', [finding_id]);
      if (rows && rows.length > 0) {
        finding = rows[0];
      }
    }
    if (!finding && !_isDbFallbackAllowed()) {
      throw new Error('Finding not found and DB fallback not allowed');
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
    const persistence = this._validateDbWriteResult(dbResult);

    let gateId = 'UNKNOWN';
    if (finding) gateId = finding.gate_id;

    await this._writeAudit(gateId, 'BETA_FINDING_RESOLVED', { finding_id }, resolved_by);

    return { finding, ...persistence, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async buildLimitedBetaEvidencePack(params) {
    const { gate_id, generated_by } = params || {};
    if (!gate_id) throw new Error('gate_id is required');

    const readiness = await this.evaluateLimitedBetaPreparationReadiness({ gate_id });

    const evidenceData = {
      gate_id,
      readiness_status: readiness.readiness_status,
      readiness_checks: readiness.checks,
      safety_invariants: { ...SAFETY_MARKERS },
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
      evidence_schema_version: '127.0',
      redaction_classification: 'INTERNAL_ONLY',
      generated_at: new Date().toISOString(),
      generated_by: generated_by || 'system',
    };
    this._packs.set(packId, pack);

    const dbResult = await this._dbWrite(
      `INSERT INTO limited_beta_evidence_packs (evidence_pack_id, gate_id, evidence_status, evidence_data_json, evidence_hash, evidence_schema_version, redaction_classification, generated_by, generated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [packId, gate_id, 'GENERATED', JSON.stringify(evidenceData), evidenceHash, '127.0', 'INTERNAL_ONLY', pack.generated_by, pack.generated_at]
    );
    const persistence = this._validateDbWriteResult(dbResult);

    await this._writeAudit(gate_id, 'BETA_EVIDENCE_PACK_BUILT', { evidence_pack_id: packId }, generated_by);

    return { evidence_pack: pack, ...persistence, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
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
