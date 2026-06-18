'use strict';

const crypto = require('crypto');

const SAFETY_MARKERS = Object.freeze({
  pilotOnly: true,
  foundingPrinthouseOnly: true,
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
  productionHandoffAllowed: false,
  automaticProductionDispatch: false,
});

const SAFETY_FLAGS_DB = Object.freeze({
  pilot_only: true,
  founding_printhouse_only: true,
  review_only: true,
  full_public_enabled: false,
  open_marketplace_enabled: false,
  live_provider_connectivity_enabled: false,
  payment_execution_enabled: false,
  refund_execution_enabled: false,
  payout_execution_enabled: false,
  external_tax_submission_enabled: false,
  external_accounting_submission_enabled: false,
  provider_external_submission_enabled: false,
  source_mutation_outside_pilot_scope: false,
  production_activation_enabled: false,
  production_handoff_allowed: false,
});

const SAFETY_MESSAGE =
  'Founding-printhouse pilot only. FULL_PUBLIC and open marketplace access remain disabled. ' +
  'No real payment/refund/payout/provider/tax/accounting execution is enabled. ' +
  'No automatic production machine dispatch. No source record mutation outside pilot scope.';

const EVIDENCE_SCHEMA_VERSION = '123.0';

const PARTICIPANT_STATUSES = [
  'DRAFT', 'REGISTERED', 'IN_REVIEW', 'CHANGES_REQUIRED',
  'APPROVED_FOR_CONTROLLED_PILOT', 'SUSPENDED', 'REJECTED', 'COMPLETED',
];

const REDACTION_FIELDS = [
  'internal_customer_reference', 'raw_customer_data', 'raw_file_package_urls',
  'raw_preflight_artifact_paths', 'raw_invoice_data', 'secrets',
];

function _isDbFallbackAllowed() {
  return process.env.NODE_ENV === 'test' || process.env.ALLOW_DB_FALLBACK_FOR_SMOKE === 'true';
}

function _isTenantAllowlisted(tenantId) {
  const allowlist = process.env.PILOT_TENANT_ALLOWLIST || '';
  const isTestMode = process.env.NODE_ENV === 'test' || process.env.ALLOW_UNSCOPED_PILOT_TENANTS_FOR_TESTS === 'true';
  if (isTestMode && allowlist.length === 0) return true;
  if (!allowlist) return false;
  return allowlist.split(',').map(t => t.trim()).includes(tenantId);
}

class FoundingPrinthousePilotGateService {
  constructor() {
    this._programs = new Map();
    this._participants = new Map();
    this._orderLinks = new Map();
    this._reviews = new Map();
    this._findings = new Map();
    this._audits = new Map();
    this._evidencePacks = new Map();

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

  _getPersistenceInfo(dbResult) {
    if (!dbResult) return { persistenceMode: 'MEMORY_FALLBACK', persistenceStatus: 'FALLBACK_ONLY' };
    if (dbResult.ok) return { persistenceMode: 'DB', persistenceStatus: 'PERSISTED' };
    if (dbResult.fallback) return { persistenceMode: 'MEMORY_FALLBACK', persistenceStatus: 'FALLBACK_ONLY' };
    return { persistenceMode: 'DB', persistenceStatus: 'FAILED' };
  }

  async _writeAudit(programId, participantId, orderLinkId, eventType, actor, payload) {
    const auditId = crypto.randomUUID();
    const record = {
      audit_id: auditId,
      pilot_program_id: programId || null,
      participant_id: participantId || null,
      order_link_id: orderLinkId || null,
      event_type: eventType,
      event_actor: actor || 'system',
      event_payload_json: payload || {},
      safety_snapshot_json: { ...SAFETY_MARKERS },
      created_at: new Date().toISOString(),
    };
    this._audits.set(auditId, record);
    await this._dbWrite(
      `INSERT INTO founding_printhouse_pilot_audits
       (audit_id, pilot_program_id, participant_id, order_link_id, event_type, event_actor, event_payload_json, safety_snapshot_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [auditId, record.pilot_program_id, record.participant_id, record.order_link_id,
       eventType, record.event_actor, JSON.stringify(record.event_payload_json), JSON.stringify(record.safety_snapshot_json)]
    );
    return record;
  }

  async createPilotProgram(payload) {
    const { tenant_id, program_name, program_scope_json, allowed_order_types_json, created_by } = payload || {};
    if (!tenant_id) throw new Error('tenant_id is required');
    if (!program_name) throw new Error('program_name is required');
    if (!_isTenantAllowlisted(tenant_id)) throw new Error('Tenant is not in PILOT_TENANT_ALLOWLIST. Access denied (fail-closed).');

    const pilotProgramId = crypto.randomUUID();
    const program = {
      pilot_program_id: pilotProgramId,
      phase: 'PHASE_123',
      tenant_id,
      program_name,
      program_status: 'DRAFT',
      program_scope_json: program_scope_json || null,
      allowed_order_types_json: allowed_order_types_json || null,
      ...SAFETY_FLAGS_DB,
      created_by: created_by || null,
      created_at: new Date().toISOString(),
    };
    this._programs.set(pilotProgramId, program);

    const dbResult = await this._dbWrite(
      `INSERT INTO founding_printhouse_pilot_programs
       (pilot_program_id, phase, tenant_id, program_name, program_status, program_scope_json, allowed_order_types_json, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [pilotProgramId, program.phase, tenant_id, program_name, program.program_status,
       JSON.stringify(program.program_scope_json), JSON.stringify(program.allowed_order_types_json), program.created_by]
    );
    const persistence = this._getPersistenceInfo(dbResult);

    await this._writeAudit(pilotProgramId, null, null, 'PILOT_PROGRAM_CREATED', created_by, { tenant_id, program_name });

    return {
      pilot_program: program,
      ...persistence,
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  async registerFoundingPrinthouse(payload) {
    const { pilot_program_id, printhouse_tenant_id, printhouse_name, pilot_scope_json, allowed_order_types_json, allowed_file_access_level, created_by } = payload || {};
    if (!pilot_program_id) throw new Error('pilot_program_id is required');
    if (!printhouse_tenant_id) throw new Error('printhouse_tenant_id is required');
    if (!printhouse_name) throw new Error('printhouse_name is required');

    const program = await this._getProgramById(pilot_program_id);
    if (!program) throw new Error('Pilot program not found');

    if (!_isTenantAllowlisted(printhouse_tenant_id)) {
      throw new Error('Printhouse tenant is not in PILOT_TENANT_ALLOWLIST. Registration denied (fail-closed).');
    }

    const participantId = crypto.randomUUID();
    const participant = {
      participant_id: participantId,
      pilot_program_id,
      printhouse_tenant_id,
      printhouse_name,
      participant_status: 'REGISTERED',
      pilot_scope_json: pilot_scope_json || null,
      allowed_order_types_json: allowed_order_types_json || null,
      allowed_file_access_level: allowed_file_access_level || 'NONE',
      production_handoff_allowed: false,
      payment_execution_allowed: false,
      provider_submission_allowed: false,
      full_public_enabled: false,
      open_marketplace_enabled: false,
      review_only: true,
      created_by: created_by || null,
      created_at: new Date().toISOString(),
    };
    this._participants.set(participantId, participant);

    const dbResult = await this._dbWrite(
      `INSERT INTO founding_printhouse_pilot_participants
       (participant_id, pilot_program_id, printhouse_tenant_id, printhouse_name, participant_status,
        pilot_scope_json, allowed_order_types_json, allowed_file_access_level, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [participantId, pilot_program_id, printhouse_tenant_id, printhouse_name, 'REGISTERED',
       JSON.stringify(participant.pilot_scope_json), JSON.stringify(participant.allowed_order_types_json),
       participant.allowed_file_access_level, participant.created_by]
    );
    const persistence = this._getPersistenceInfo(dbResult);

    await this._writeAudit(pilot_program_id, participantId, null, 'FOUNDING_PRINTHOUSE_REGISTERED', created_by, { printhouse_tenant_id, printhouse_name });

    return {
      participant,
      ...persistence,
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  async evaluateParticipantReadiness(payload) {
    const { participant_id } = payload || {};
    if (!participant_id) throw new Error('participant_id is required');
    const participant = await this._getParticipantById(participant_id);
    if (!participant) throw new Error('Participant not found');

    const readiness = {
      participant_id,
      printhouse_tenant_id: participant.printhouse_tenant_id,
      phase122_1_validated: false,
      phase122_2_validated: false,
      printhouse_tenant_exists: true,
      tenant_explicitly_allowlisted: _isTenantAllowlisted(participant.printhouse_tenant_id),
      participant_approved: participant.participant_status === 'APPROVED_FOR_CONTROLLED_PILOT',
      no_unresolved_blocker_findings: true,
      allowed_file_access_scope_defined: participant.allowed_file_access_level !== 'NONE',
      no_payment_execution_enabled: !participant.payment_execution_allowed,
      no_provider_external_submission: !participant.provider_submission_allowed,
      no_open_marketplace: !participant.open_marketplace_enabled,
      no_full_public: !participant.full_public_enabled,
    };

    const evidenceRows122_1 = await this._dbRead(
      "SELECT evidence_status FROM internal_order_lifecycle_pilot_evidence_packs WHERE evidence_status = 'GENERATED' LIMIT 1", []
    );
    if (evidenceRows122_1 && evidenceRows122_1.length > 0) {
      readiness.phase122_1_validated = true;
    }

    const evidenceRows122_2 = await this._dbRead(
      "SELECT verification_run_id FROM internal_order_lifecycle_runtime_verification_runs WHERE status = 'PASSED' LIMIT 1", []
    );
    if (evidenceRows122_2 && evidenceRows122_2.length > 0) {
      readiness.phase122_2_validated = true;
    }

    const unresolvedBlockers = await this._getUnresolvedBlockerFindings(participant.pilot_program_id, participant_id);
    readiness.no_unresolved_blocker_findings = unresolvedBlockers.length === 0;

    const allPassed = readiness.phase122_1_validated && readiness.phase122_2_validated &&
      readiness.tenant_explicitly_allowlisted && readiness.participant_approved &&
      readiness.no_unresolved_blocker_findings && readiness.allowed_file_access_scope_defined &&
      readiness.no_payment_execution_enabled && readiness.no_provider_external_submission &&
      readiness.no_open_marketplace && readiness.no_full_public;

    readiness.overall_readiness = allPassed ? 'READY' : 'NOT_READY';

    return {
      readiness,
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  async approveParticipantForPilot(payload) {
    const { participant_id, approved_by } = payload || {};
    if (!participant_id) throw new Error('participant_id is required');
    const participant = await this._getParticipantById(participant_id);
    if (!participant) throw new Error('Participant not found');

    if (!_isTenantAllowlisted(participant.printhouse_tenant_id)) {
      throw new Error('Cannot approve: printhouse tenant is not in PILOT_TENANT_ALLOWLIST (fail-closed).');
    }

    const unresolvedBlockers = await this._getUnresolvedBlockerFindings(participant.pilot_program_id, participant_id);
    if (unresolvedBlockers.length > 0) {
      throw new Error(`Cannot approve: ${unresolvedBlockers.length} unresolved blocker finding(s) exist.`);
    }

    participant.participant_status = 'APPROVED_FOR_CONTROLLED_PILOT';
    participant.updated_at = new Date().toISOString();
    this._participants.set(participant_id, participant);

    const dbResult = await this._dbWrite(
      `UPDATE founding_printhouse_pilot_participants SET participant_status = 'APPROVED_FOR_CONTROLLED_PILOT', updated_at = NOW() WHERE participant_id = ?`,
      [participant_id]
    );
    const persistence = this._getPersistenceInfo(dbResult);

    await this._writeAudit(participant.pilot_program_id, participant_id, null, 'PARTICIPANT_APPROVED_FOR_CONTROLLED_PILOT', approved_by, { printhouse_tenant_id: participant.printhouse_tenant_id });

    return {
      participant,
      ...persistence,
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  async suspendParticipant(payload) {
    const { participant_id, suspended_by, reason } = payload || {};
    if (!participant_id) throw new Error('participant_id is required');
    const participant = await this._getParticipantById(participant_id);
    if (!participant) throw new Error('Participant not found');

    participant.participant_status = 'SUSPENDED';
    participant.updated_at = new Date().toISOString();
    this._participants.set(participant_id, participant);

    const dbResult = await this._dbWrite(
      `UPDATE founding_printhouse_pilot_participants SET participant_status = 'SUSPENDED', updated_at = NOW() WHERE participant_id = ?`,
      [participant_id]
    );
    const persistence = this._getPersistenceInfo(dbResult);

    await this._writeAudit(participant.pilot_program_id, participant_id, null, 'PARTICIPANT_SUSPENDED', suspended_by, { reason });

    return {
      participant,
      ...persistence,
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  async linkInternalPilotOrder(payload) {
    const { pilot_program_id, participant_id, pilot_run_id, pilot_order_id, created_by } = payload || {};
    if (!pilot_program_id) throw new Error('pilot_program_id is required');
    if (!participant_id) throw new Error('participant_id is required');

    const program = await this._getProgramById(pilot_program_id);
    if (!program) throw new Error('Pilot program not found');
    const participant = await this._getParticipantById(participant_id);
    if (!participant) throw new Error('Participant not found');

    if (participant.participant_status !== 'APPROVED_FOR_CONTROLLED_PILOT') {
      throw new Error('Participant must be APPROVED_FOR_CONTROLLED_PILOT to link orders.');
    }

    const orderLinkId = crypto.randomUUID();
    const link = {
      order_link_id: orderLinkId,
      pilot_program_id,
      participant_id,
      pilot_run_id: pilot_run_id || null,
      pilot_order_id: pilot_order_id || null,
      printhouse_tenant_id: participant.printhouse_tenant_id,
      link_status: 'LINKED',
      order_handoff_readiness: 'NOT_EVALUATED',
      review_only: true,
      production_handoff_allowed: false,
      created_by: created_by || null,
      created_at: new Date().toISOString(),
    };
    this._orderLinks.set(orderLinkId, link);

    const dbResult = await this._dbWrite(
      `INSERT INTO founding_printhouse_pilot_order_links
       (order_link_id, pilot_program_id, participant_id, pilot_run_id, pilot_order_id, printhouse_tenant_id, link_status, order_handoff_readiness, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [orderLinkId, pilot_program_id, participant_id, link.pilot_run_id, link.pilot_order_id,
       link.printhouse_tenant_id, link.link_status, link.order_handoff_readiness, link.created_by]
    );
    const persistence = this._getPersistenceInfo(dbResult);

    await this._writeAudit(pilot_program_id, participant_id, orderLinkId, 'INTERNAL_PILOT_ORDER_LINKED', created_by, { pilot_run_id, pilot_order_id });

    return {
      order_link: link,
      ...persistence,
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  async evaluateOrderHandoffReadiness(payload) {
    const { order_link_id } = payload || {};
    if (!order_link_id) throw new Error('order_link_id is required');
    const link = await this._getOrderLinkById(order_link_id);
    if (!link) throw new Error('Order link not found');
    const participant = await this._getParticipantById(link.participant_id);

    const readiness = {
      order_link_id,
      participant_approved: participant ? participant.participant_status === 'APPROVED_FOR_CONTROLLED_PILOT' : false,
      tenant_allowlisted: participant ? _isTenantAllowlisted(participant.printhouse_tenant_id) : false,
      no_unresolved_blocker_findings: true,
      no_payment_execution: true,
      no_provider_submission: true,
      no_full_public: true,
      no_open_marketplace: true,
    };

    const unresolvedBlockers = await this._getUnresolvedBlockerFindings(link.pilot_program_id, link.participant_id);
    readiness.no_unresolved_blocker_findings = unresolvedBlockers.length === 0;
    readiness.blocker_count = unresolvedBlockers.length;

    const allPassed = readiness.participant_approved && readiness.tenant_allowlisted &&
      readiness.no_unresolved_blocker_findings && readiness.no_payment_execution &&
      readiness.no_provider_submission && readiness.no_full_public && readiness.no_open_marketplace;

    readiness.handoff_readiness = allPassed ? 'READY' : 'NOT_READY';

    link.order_handoff_readiness = readiness.handoff_readiness;
    this._orderLinks.set(order_link_id, link);
    await this._dbWrite(
      `UPDATE founding_printhouse_pilot_order_links SET order_handoff_readiness = ?, updated_at = NOW() WHERE order_link_id = ?`,
      [readiness.handoff_readiness, order_link_id]
    );

    await this._writeAudit(link.pilot_program_id, link.participant_id, order_link_id, 'ORDER_HANDOFF_READINESS_EVALUATED', 'system', readiness);

    return {
      readiness,
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  async submitPrinthouseReview(payload) {
    const { pilot_program_id, participant_id, order_link_id, reviewer, review_status, review_notes } = payload || {};
    if (!pilot_program_id) throw new Error('pilot_program_id is required');
    if (!participant_id) throw new Error('participant_id is required');

    const reviewId = crypto.randomUUID();
    const review = {
      review_id: reviewId,
      pilot_program_id,
      participant_id,
      order_link_id: order_link_id || null,
      reviewer: reviewer || null,
      review_status: review_status || 'PENDING',
      review_notes: review_notes || null,
      created_at: new Date().toISOString(),
    };
    this._reviews.set(reviewId, review);

    const dbResult = await this._dbWrite(
      `INSERT INTO founding_printhouse_pilot_reviews
       (review_id, pilot_program_id, participant_id, order_link_id, reviewer, review_status, review_notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [reviewId, pilot_program_id, participant_id, review.order_link_id, review.reviewer, review.review_status, review.review_notes]
    );
    const persistence = this._getPersistenceInfo(dbResult);

    await this._writeAudit(pilot_program_id, participant_id, order_link_id, 'PRINTHOUSE_REVIEW_SUBMITTED', reviewer, { review_status });

    return {
      review,
      ...persistence,
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  async recordPilotFinding(payload) {
    const { pilot_program_id, participant_id, order_link_id, finding_type, blocks_handoff, severity, summary, details_json, created_by } = payload || {};
    if (!pilot_program_id) throw new Error('pilot_program_id is required');

    const findingId = crypto.randomUUID();
    const finding = {
      finding_id: findingId,
      pilot_program_id,
      participant_id: participant_id || null,
      order_link_id: order_link_id || null,
      finding_type: finding_type || 'OBSERVATION',
      finding_status: 'OPEN',
      blocks_handoff: blocks_handoff || false,
      severity: severity || 'LOW',
      summary: summary || null,
      details_json: details_json || null,
      created_by: created_by || null,
      created_at: new Date().toISOString(),
    };
    this._findings.set(findingId, finding);

    const dbResult = await this._dbWrite(
      `INSERT INTO founding_printhouse_pilot_findings
       (finding_id, pilot_program_id, participant_id, order_link_id, finding_type, finding_status, blocks_handoff, severity, summary, details_json, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [findingId, pilot_program_id, finding.participant_id, finding.order_link_id, finding.finding_type,
       'OPEN', finding.blocks_handoff ? 1 : 0, finding.severity, finding.summary, JSON.stringify(finding.details_json), finding.created_by]
    );
    const persistence = this._getPersistenceInfo(dbResult);

    await this._writeAudit(pilot_program_id, participant_id, order_link_id, 'PILOT_FINDING_RECORDED', created_by, { finding_type, severity, blocks_handoff });

    return {
      finding,
      ...persistence,
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  async resolvePilotFinding(payload) {
    const { finding_id, resolved_by } = payload || {};
    if (!finding_id) throw new Error('finding_id is required');
    const finding = await this._getFindingById(finding_id);
    if (!finding) throw new Error('Finding not found');

    finding.finding_status = 'RESOLVED';
    finding.resolved_by = resolved_by || null;
    finding.updated_at = new Date().toISOString();
    this._findings.set(finding_id, finding);

    const dbResult = await this._dbWrite(
      `UPDATE founding_printhouse_pilot_findings SET finding_status = 'RESOLVED', resolved_by = ?, updated_at = NOW() WHERE finding_id = ?`,
      [resolved_by || null, finding_id]
    );
    const persistence = this._getPersistenceInfo(dbResult);

    await this._writeAudit(finding.pilot_program_id, finding.participant_id, finding.order_link_id, 'PILOT_FINDING_RESOLVED', resolved_by, { finding_id });

    return {
      finding,
      ...persistence,
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  async buildPrinthousePilotEvidencePack(payload) {
    const { pilot_program_id, participant_id } = payload || {};
    if (!pilot_program_id) throw new Error('pilot_program_id is required');
    const program = await this._getProgramById(pilot_program_id);
    if (!program) throw new Error('Pilot program not found');

    const participant = participant_id ? await this._getParticipantById(participant_id) : null;

    const allFindings = [];
    for (const [, f] of this._findings) {
      if (f.pilot_program_id === pilot_program_id) allFindings.push(f);
    }
    const dbFindings = await this._dbRead(
      'SELECT * FROM founding_printhouse_pilot_findings WHERE pilot_program_id = ? ORDER BY created_at ASC',
      [pilot_program_id]
    );

    const findings = dbFindings || allFindings;
    const unresolvedBlockers = findings.filter(f => f.finding_status !== 'RESOLVED' && (f.blocks_handoff === true || f.blocks_handoff === 1));

    const allAudits = [];
    for (const [, a] of this._audits) {
      if (a.pilot_program_id === pilot_program_id) allAudits.push(a);
    }
    const dbAudits = await this._dbRead(
      'SELECT * FROM founding_printhouse_pilot_audits WHERE pilot_program_id = ? ORDER BY created_at ASC',
      [pilot_program_id]
    );

    const evidencePackId = crypto.randomUUID();
    const evidencePack = {
      evidence_pack_id: evidencePackId,
      evidence_schema_version: EVIDENCE_SCHEMA_VERSION,
      pilot_program_id,
      program_name: program.program_name,
      tenant_id: program.tenant_id,
      participant_id: participant_id || null,
      participant_status: participant ? participant.participant_status : null,
      printhouse_tenant_id: participant ? participant.printhouse_tenant_id : null,
      findings_summary: {
        total: findings.length,
        open: findings.filter(f => f.finding_status === 'OPEN').length,
        resolved: findings.filter(f => f.finding_status === 'RESOLVED').length,
        unresolved_blockers: unresolvedBlockers.length,
      },
      audit_summary: {
        total_events: (dbAudits || allAudits).length,
      },
      redaction_classification: 'INTERNAL_ONLY',
      redacted_fields: REDACTION_FIELDS,
      safety_invariants: {
        ...SAFETY_MARKERS,
      },
      generated_at: new Date().toISOString(),
      generated_by: 'system',
    };

    const integrityHash = crypto.createHash('sha256').update(JSON.stringify(evidencePack)).digest('hex');
    evidencePack.integrity_hash = integrityHash;

    this._evidencePacks.set(evidencePackId, evidencePack);
    await this._dbWrite(
      `INSERT INTO founding_printhouse_pilot_evidence_packs
       (evidence_pack_id, pilot_program_id, participant_id, evidence_status, evidence_schema_version, evidence_hash, evidence_json, redaction_classification, generated_by)
       VALUES (?, ?, ?, 'GENERATED', ?, ?, ?, 'INTERNAL_ONLY', 'system')`,
      [evidencePackId, pilot_program_id, participant_id || null, EVIDENCE_SCHEMA_VERSION, integrityHash, JSON.stringify(evidencePack)]
    );

    await this._writeAudit(pilot_program_id, participant_id, null, 'PRINTHOUSE_PILOT_EVIDENCE_PACK_BUILT', 'system', {
      evidence_pack_id: evidencePackId, integrity_hash: integrityHash, findings_total: findings.length, unresolved_blockers: unresolvedBlockers.length,
    });

    return {
      evidence_pack: evidencePack,
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  async getPrinthousePilotAuditTimeline(payload) {
    const { pilot_program_id, participant_id } = payload || {};
    if (!pilot_program_id) throw new Error('pilot_program_id is required');

    const memAudits = [];
    for (const [, a] of this._audits) {
      if (a.pilot_program_id === pilot_program_id) {
        if (!participant_id || a.participant_id === participant_id) memAudits.push(a);
      }
    }

    let sql = 'SELECT * FROM founding_printhouse_pilot_audits WHERE pilot_program_id = ?';
    const params = [pilot_program_id];
    if (participant_id) {
      sql += ' AND participant_id = ?';
      params.push(participant_id);
    }
    sql += ' ORDER BY created_at ASC';
    const dbRows = await this._dbRead(sql, params);

    return {
      audit_timeline: dbRows || memAudits,
      source: dbRows ? 'DB' : 'MEMORY',
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  async getReadiness(payload) {
    const { pilot_program_id } = payload || {};

    const readiness = {
      phase122_1_validated: false,
      phase122_2_validated: false,
      migration_065_applied: false,
      migration_066_applied: false,
      migration_067_applied: false,
      db_available: !!this._db,
      tenant_allowlist_fail_closed: !(process.env.NODE_ENV === 'test' || process.env.ALLOW_UNSCOPED_PILOT_TENANTS_FOR_TESTS === 'true') || !!(process.env.PILOT_TENANT_ALLOWLIST),
    };

    const schemaRows = await this._dbRead(
      "SELECT version FROM schema_versions WHERE version IN ('065', '066', '067') ORDER BY version ASC", []
    );
    if (schemaRows) {
      for (const row of schemaRows) {
        if (String(row.version) === '065') readiness.migration_065_applied = true;
        if (String(row.version) === '066') readiness.migration_066_applied = true;
        if (String(row.version) === '067') readiness.migration_067_applied = true;
      }
    }

    const ev1 = await this._dbRead(
      "SELECT evidence_status FROM internal_order_lifecycle_pilot_evidence_packs WHERE evidence_status = 'GENERATED' LIMIT 1", []
    );
    if (ev1 && ev1.length > 0) readiness.phase122_1_validated = true;

    const ev2 = await this._dbRead(
      "SELECT verification_run_id FROM internal_order_lifecycle_runtime_verification_runs WHERE status = 'PASSED' LIMIT 1", []
    );
    if (ev2 && ev2.length > 0) readiness.phase122_2_validated = true;

    let program = null;
    if (pilot_program_id) {
      program = await this._getProgramById(pilot_program_id);
    }

    return {
      readiness,
      pilot_program: program,
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  // --- Internal lookup helpers ---

  async _getProgramById(id) {
    if (this._programs.has(id)) return this._programs.get(id);
    const rows = await this._dbRead('SELECT * FROM founding_printhouse_pilot_programs WHERE pilot_program_id = ?', [id]);
    if (rows && rows.length > 0) { this._programs.set(id, rows[0]); return rows[0]; }
    return null;
  }

  async _getParticipantById(id) {
    if (this._participants.has(id)) return this._participants.get(id);
    const rows = await this._dbRead('SELECT * FROM founding_printhouse_pilot_participants WHERE participant_id = ?', [id]);
    if (rows && rows.length > 0) { this._participants.set(id, rows[0]); return rows[0]; }
    return null;
  }

  async _getOrderLinkById(id) {
    if (this._orderLinks.has(id)) return this._orderLinks.get(id);
    const rows = await this._dbRead('SELECT * FROM founding_printhouse_pilot_order_links WHERE order_link_id = ?', [id]);
    if (rows && rows.length > 0) { this._orderLinks.set(id, rows[0]); return rows[0]; }
    return null;
  }

  async _getFindingById(id) {
    if (this._findings.has(id)) return this._findings.get(id);
    const rows = await this._dbRead('SELECT * FROM founding_printhouse_pilot_findings WHERE finding_id = ?', [id]);
    if (rows && rows.length > 0) { this._findings.set(id, rows[0]); return rows[0]; }
    return null;
  }

  async _getUnresolvedBlockerFindings(programId, participantId) {
    const memBlockers = [];
    for (const [, f] of this._findings) {
      if (f.pilot_program_id === programId && f.finding_status !== 'RESOLVED' && f.blocks_handoff) {
        if (!participantId || f.participant_id === participantId) memBlockers.push(f);
      }
    }

    let sql = "SELECT * FROM founding_printhouse_pilot_findings WHERE pilot_program_id = ? AND finding_status != 'RESOLVED' AND blocks_handoff = 1";
    const params = [programId];
    if (participantId) { sql += ' AND participant_id = ?'; params.push(participantId); }
    const dbRows = await this._dbRead(sql, params);

    return dbRows || memBlockers;
  }
}

module.exports = FoundingPrinthousePilotGateService;
