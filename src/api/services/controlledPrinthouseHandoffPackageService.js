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
  productionDispatchEnabled: false,
  automaticProductionDispatch: false,
  unrestrictedFileAccess: false,
  permanentPublicUrl: false,
});

const SAFETY_FLAGS_DB = Object.freeze({
  pilot_only: true,
  founding_printhouse_only: true,
  review_only: true,
  production_dispatch_enabled: false,
  provider_submission_enabled: false,
  payment_execution_enabled: false,
  refund_execution_enabled: false,
  payout_execution_enabled: false,
  full_public_enabled: false,
  open_marketplace_enabled: false,
  unrestricted_file_access: false,
  permanent_public_url: false,
  external_tax_submission_enabled: false,
  external_accounting_submission_enabled: false,
  provider_external_submission_enabled: false,
  source_mutation_outside_pilot_scope: false,
  production_activation_enabled: false,
});

const SAFETY_MESSAGE =
  'Controlled printhouse handoff / file package pilot only. FULL_PUBLIC and open marketplace access remain disabled. ' +
  'No automatic production dispatch. No unrestricted file access. No permanent public URLs. ' +
  'No real payment/refund/payout/provider/tax/accounting execution is enabled. ' +
  'No source record mutation outside pilot scope.';

const EVIDENCE_SCHEMA_VERSION = '124.0';

const PACKAGE_STATUSES = [
  'DRAFT', 'READY_FOR_REVIEW', 'IN_REVIEW', 'ACCEPTED_BY_PRINTHOUSE',
  'REJECTED_BY_PRINTHOUSE', 'CHANGES_REQUIRED', 'SUSPENDED', 'COMPLETED',
];

const REDACTION_FIELDS = [
  'internal_customer_reference', 'raw_customer_data', 'raw_file_package_urls',
  'raw_preflight_artifact_paths', 'raw_invoice_data', 'secrets',
  'internal_file_paths', 'raw_internal_urls',
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

class ControlledPrinthouseHandoffPackageService {
  constructor(opts) {
    this._phase123Service = (opts && opts.phase123Service) || null;
    this._packages = new Map();
    this._packageFiles = new Map();
    this._reviews = new Map();
    this._accessGrants = new Map();
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

  async _writeAudit(packageId, programId, participantId, grantId, eventType, actor, payload) {
    const auditId = crypto.randomUUID();
    const record = {
      audit_id: auditId,
      handoff_package_id: packageId || null,
      pilot_program_id: programId || null,
      participant_id: participantId || null,
      access_grant_id: grantId || null,
      event_type: eventType,
      event_actor: actor || 'system',
      event_payload_json: payload || {},
      safety_snapshot_json: { ...SAFETY_MARKERS },
      created_at: new Date().toISOString(),
    };
    this._audits.set(auditId, record);
    await this._dbWrite(
      `INSERT INTO controlled_printhouse_handoff_audits
       (audit_id, handoff_package_id, pilot_program_id, participant_id, access_grant_id, event_type, event_actor, event_payload_json, safety_snapshot_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [auditId, record.handoff_package_id, record.pilot_program_id, record.participant_id,
       record.access_grant_id, eventType, record.event_actor,
       JSON.stringify(record.event_payload_json), JSON.stringify(record.safety_snapshot_json)]
    );
    return record;
  }

  async createHandoffPackage(payload) {
    const { pilot_program_id, participant_id, pilot_order_id, order_link_id, printhouse_tenant_id, file_access_scope, file_access_expires_at, created_by } = payload || {};
    if (!pilot_program_id) throw new Error('pilot_program_id is required');
    if (!participant_id) throw new Error('participant_id is required');
    if (!printhouse_tenant_id) throw new Error('printhouse_tenant_id is required');

    if (!_isTenantAllowlisted(printhouse_tenant_id)) {
      throw new Error('Printhouse tenant is not in PILOT_TENANT_ALLOWLIST. Access denied (fail-closed).');
    }

    const participant = await this._getParticipantFromPhase123(participant_id);
    if (!participant) throw new Error('Participant not found in Phase 123 registry');
    if (participant.participant_status !== 'APPROVED_FOR_CONTROLLED_PILOT') {
      throw new Error('Participant must be APPROVED_FOR_CONTROLLED_PILOT to create handoff package.');
    }

    const handoffPackageId = crypto.randomUUID();
    const pkg = {
      handoff_package_id: handoffPackageId,
      phase: 'PHASE_124',
      pilot_program_id,
      participant_id,
      pilot_order_id: pilot_order_id || null,
      order_link_id: order_link_id || null,
      printhouse_tenant_id,
      package_status: 'DRAFT',
      file_access_scope: file_access_scope || 'REDACTED_PREVIEW',
      file_access_expires_at: file_access_expires_at || null,
      file_download_audit_required: true,
      ...SAFETY_FLAGS_DB,
      created_by: created_by || null,
      created_at: new Date().toISOString(),
    };
    this._packages.set(handoffPackageId, pkg);

    const dbResult = await this._dbWrite(
      `INSERT INTO controlled_printhouse_handoff_packages
       (handoff_package_id, phase, pilot_program_id, participant_id, pilot_order_id, order_link_id,
        printhouse_tenant_id, package_status, file_access_scope, file_access_expires_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [handoffPackageId, pkg.phase, pilot_program_id, participant_id, pkg.pilot_order_id, pkg.order_link_id,
       printhouse_tenant_id, pkg.package_status, pkg.file_access_scope, pkg.file_access_expires_at, pkg.created_by]
    );
    const persistence = this._getPersistenceInfo(dbResult);

    await this._writeAudit(handoffPackageId, pilot_program_id, participant_id, null, 'HANDOFF_PACKAGE_CREATED', created_by, { printhouse_tenant_id, pilot_order_id });

    return {
      handoff_package: pkg,
      ...persistence,
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  async evaluateHandoffReadiness(payload) {
    const { handoff_package_id } = payload || {};
    if (!handoff_package_id) throw new Error('handoff_package_id is required');

    const pkg = await this._getPackageById(handoff_package_id);
    if (!pkg) throw new Error('Handoff package not found');

    const participant = await this._getParticipantFromPhase123(pkg.participant_id);

    const unresolvedBlockers = await this._getUnresolvedBlockerFindings(handoff_package_id);

    const readiness = {
      handoff_package_id,
      participant_approved: participant ? participant.participant_status === 'APPROVED_FOR_CONTROLLED_PILOT' : false,
      tenant_allowlisted: _isTenantAllowlisted(pkg.printhouse_tenant_id),
      file_access_scope_defined: pkg.file_access_scope !== 'NONE',
      no_unresolved_blocker_findings: unresolvedBlockers.length === 0,
      blocker_count: unresolvedBlockers.length,
      no_production_dispatch: !pkg.production_dispatch_enabled,
      no_provider_submission: !pkg.provider_submission_enabled,
      no_payment_execution: !pkg.payment_execution_enabled,
      no_full_public: !pkg.full_public_enabled,
      no_open_marketplace: !pkg.open_marketplace_enabled,
      no_unrestricted_file_access: !pkg.unrestricted_file_access,
      no_permanent_public_url: !pkg.permanent_public_url,
      file_download_audit_required: pkg.file_download_audit_required,
    };

    const allPassed = readiness.participant_approved && readiness.tenant_allowlisted &&
      readiness.file_access_scope_defined && readiness.no_unresolved_blocker_findings &&
      readiness.no_production_dispatch && readiness.no_provider_submission &&
      readiness.no_payment_execution && readiness.no_full_public && readiness.no_open_marketplace &&
      readiness.no_unrestricted_file_access && readiness.no_permanent_public_url;

    readiness.handoff_readiness = allPassed ? 'READY' : 'NOT_READY';

    await this._writeAudit(handoff_package_id, pkg.pilot_program_id, pkg.participant_id, null, 'HANDOFF_READINESS_EVALUATED', 'system', readiness);

    return {
      readiness,
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  async addPackageFileMetadata(payload) {
    const { handoff_package_id, file_name, file_type, file_size_bytes, file_scope, file_metadata_json, preflight_status, production_constraints_json, created_by } = payload || {};
    if (!handoff_package_id) throw new Error('handoff_package_id is required');

    const pkg = await this._getPackageById(handoff_package_id);
    if (!pkg) throw new Error('Handoff package not found');

    const packageFileId = crypto.randomUUID();
    const fileRecord = {
      package_file_id: packageFileId,
      handoff_package_id,
      file_name: file_name || null,
      file_type: file_type || null,
      file_size_bytes: file_size_bytes || null,
      file_scope: file_scope || 'REDACTED_PREVIEW',
      file_metadata_json: file_metadata_json || null,
      preflight_status: preflight_status || 'UNKNOWN',
      production_constraints_json: production_constraints_json || null,
      created_by: created_by || null,
      created_at: new Date().toISOString(),
    };
    this._packageFiles.set(packageFileId, fileRecord);

    const dbResult = await this._dbWrite(
      `INSERT INTO controlled_printhouse_handoff_package_files
       (package_file_id, handoff_package_id, file_name, file_type, file_size_bytes, file_scope,
        file_metadata_json, preflight_status, production_constraints_json, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [packageFileId, handoff_package_id, fileRecord.file_name, fileRecord.file_type,
       fileRecord.file_size_bytes, fileRecord.file_scope, JSON.stringify(fileRecord.file_metadata_json),
       fileRecord.preflight_status, JSON.stringify(fileRecord.production_constraints_json), fileRecord.created_by]
    );
    const persistence = this._getPersistenceInfo(dbResult);

    await this._writeAudit(handoff_package_id, pkg.pilot_program_id, pkg.participant_id, null, 'PACKAGE_FILE_METADATA_ADDED', created_by, { file_name, file_type, file_scope });

    return {
      package_file: fileRecord,
      ...persistence,
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  async createScopedFileAccessGrant(payload) {
    const { handoff_package_id, participant_id, printhouse_tenant_id, pilot_order_id, access_scope, expires_at, created_by } = payload || {};
    if (!handoff_package_id) throw new Error('handoff_package_id is required');
    if (!participant_id) throw new Error('participant_id is required');
    if (!printhouse_tenant_id) throw new Error('printhouse_tenant_id is required');

    if (!_isTenantAllowlisted(printhouse_tenant_id)) {
      throw new Error('Printhouse tenant is not in PILOT_TENANT_ALLOWLIST. Access grant denied (fail-closed).');
    }

    const pkg = await this._getPackageById(handoff_package_id);
    if (!pkg) throw new Error('Handoff package not found');

    if (!expires_at) throw new Error('expires_at is required. File grants must have expiration.');

    const accessGrantId = crypto.randomUUID();
    const grant = {
      access_grant_id: accessGrantId,
      handoff_package_id,
      participant_id,
      printhouse_tenant_id,
      pilot_order_id: pilot_order_id || null,
      grant_status: 'ACTIVE',
      access_scope: access_scope || 'REDACTED_PREVIEW',
      expires_at,
      revoked_at: null,
      revoked_by: null,
      download_audit_required: true,
      unrestricted_file_access: false,
      permanent_public_url: false,
      created_by: created_by || null,
      created_at: new Date().toISOString(),
    };
    this._accessGrants.set(accessGrantId, grant);

    const dbResult = await this._dbWrite(
      `INSERT INTO controlled_printhouse_handoff_access_grants
       (access_grant_id, handoff_package_id, participant_id, printhouse_tenant_id, pilot_order_id,
        grant_status, access_scope, expires_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [accessGrantId, handoff_package_id, participant_id, printhouse_tenant_id, grant.pilot_order_id,
       grant.grant_status, grant.access_scope, expires_at, grant.created_by]
    );
    const persistence = this._getPersistenceInfo(dbResult);

    await this._writeAudit(handoff_package_id, pkg.pilot_program_id, participant_id, accessGrantId, 'FILE_ACCESS_GRANT_CREATED', created_by, {
      access_scope: grant.access_scope, expires_at, printhouse_tenant_id,
    });

    return {
      access_grant: grant,
      ...persistence,
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  async revokeFileAccessGrant(payload) {
    const { access_grant_id, revoked_by } = payload || {};
    if (!access_grant_id) throw new Error('access_grant_id is required');

    const grant = await this._getAccessGrantById(access_grant_id);
    if (!grant) throw new Error('Access grant not found');

    grant.grant_status = 'REVOKED';
    grant.revoked_at = new Date().toISOString();
    grant.revoked_by = revoked_by || null;
    this._accessGrants.set(access_grant_id, grant);

    const dbResult = await this._dbWrite(
      `UPDATE controlled_printhouse_handoff_access_grants SET grant_status = 'REVOKED', revoked_at = NOW(), revoked_by = ? WHERE access_grant_id = ?`,
      [revoked_by || null, access_grant_id]
    );
    const persistence = this._getPersistenceInfo(dbResult);

    await this._writeAudit(grant.handoff_package_id, null, grant.participant_id, access_grant_id, 'FILE_ACCESS_GRANT_REVOKED', revoked_by, { access_grant_id });

    return {
      access_grant: grant,
      ...persistence,
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  async submitPrinthouseHandoffReview(payload) {
    const { handoff_package_id, pilot_program_id, participant_id, reviewer, review_status, review_notes } = payload || {};
    if (!handoff_package_id) throw new Error('handoff_package_id is required');
    if (!pilot_program_id) throw new Error('pilot_program_id is required');
    if (!participant_id) throw new Error('participant_id is required');

    const reviewId = crypto.randomUUID();
    const review = {
      review_id: reviewId,
      handoff_package_id,
      pilot_program_id,
      participant_id,
      reviewer: reviewer || null,
      review_status: review_status || 'PENDING',
      review_notes: review_notes || null,
      review_type: 'HANDOFF_REVIEW',
      created_at: new Date().toISOString(),
    };
    this._reviews.set(reviewId, review);

    const dbResult = await this._dbWrite(
      `INSERT INTO controlled_printhouse_handoff_reviews
       (review_id, handoff_package_id, pilot_program_id, participant_id, reviewer, review_status, review_notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [reviewId, handoff_package_id, pilot_program_id, participant_id, review.reviewer, review.review_status, review.review_notes]
    );
    const persistence = this._getPersistenceInfo(dbResult);

    await this._writeAudit(handoff_package_id, pilot_program_id, participant_id, null, 'HANDOFF_REVIEW_SUBMITTED', reviewer, { review_status });

    return {
      review,
      ...persistence,
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  async acceptHandoffPackage(payload) {
    const { handoff_package_id, accepted_by } = payload || {};
    if (!handoff_package_id) throw new Error('handoff_package_id is required');

    const pkg = await this._getPackageById(handoff_package_id);
    if (!pkg) throw new Error('Handoff package not found');

    const unresolvedBlockers = await this._getUnresolvedBlockerFindings(handoff_package_id);
    if (unresolvedBlockers.length > 0) {
      throw new Error(`Cannot accept: ${unresolvedBlockers.length} unresolved blocker finding(s) exist.`);
    }

    pkg.package_status = 'ACCEPTED_BY_PRINTHOUSE';
    pkg.updated_at = new Date().toISOString();
    this._packages.set(handoff_package_id, pkg);

    const dbResult = await this._dbWrite(
      `UPDATE controlled_printhouse_handoff_packages SET package_status = 'ACCEPTED_BY_PRINTHOUSE', updated_at = NOW() WHERE handoff_package_id = ?`,
      [handoff_package_id]
    );
    const persistence = this._getPersistenceInfo(dbResult);

    await this._writeAudit(handoff_package_id, pkg.pilot_program_id, pkg.participant_id, null, 'HANDOFF_PACKAGE_ACCEPTED', accepted_by, {});

    return {
      handoff_package: pkg,
      ...persistence,
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  async rejectHandoffPackage(payload) {
    const { handoff_package_id, rejected_by, reason } = payload || {};
    if (!handoff_package_id) throw new Error('handoff_package_id is required');

    const pkg = await this._getPackageById(handoff_package_id);
    if (!pkg) throw new Error('Handoff package not found');

    pkg.package_status = 'REJECTED_BY_PRINTHOUSE';
    pkg.updated_at = new Date().toISOString();
    this._packages.set(handoff_package_id, pkg);

    const dbResult = await this._dbWrite(
      `UPDATE controlled_printhouse_handoff_packages SET package_status = 'REJECTED_BY_PRINTHOUSE', updated_at = NOW() WHERE handoff_package_id = ?`,
      [handoff_package_id]
    );
    const persistence = this._getPersistenceInfo(dbResult);

    await this._writeAudit(handoff_package_id, pkg.pilot_program_id, pkg.participant_id, null, 'HANDOFF_PACKAGE_REJECTED', rejected_by, { reason });

    return {
      handoff_package: pkg,
      ...persistence,
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  async recordHandoffFinding(payload) {
    const { handoff_package_id, pilot_program_id, participant_id, finding_type, blocks_handoff, severity, summary, details_json, created_by } = payload || {};
    if (!handoff_package_id) throw new Error('handoff_package_id is required');
    if (!pilot_program_id) throw new Error('pilot_program_id is required');

    const findingId = crypto.randomUUID();
    const finding = {
      finding_id: findingId,
      handoff_package_id,
      pilot_program_id,
      participant_id: participant_id || null,
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
      `INSERT INTO controlled_printhouse_handoff_findings
       (finding_id, handoff_package_id, pilot_program_id, participant_id, finding_type, finding_status, blocks_handoff, severity, summary, details_json, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [findingId, handoff_package_id, pilot_program_id, finding.participant_id, finding.finding_type,
       'OPEN', finding.blocks_handoff ? 1 : 0, finding.severity, finding.summary, JSON.stringify(finding.details_json), finding.created_by]
    );
    const persistence = this._getPersistenceInfo(dbResult);

    await this._writeAudit(handoff_package_id, pilot_program_id, participant_id, null, 'HANDOFF_FINDING_RECORDED', created_by, { finding_type, severity, blocks_handoff });

    return {
      finding,
      ...persistence,
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  async resolveHandoffFinding(payload) {
    const { finding_id, resolved_by } = payload || {};
    if (!finding_id) throw new Error('finding_id is required');

    const finding = await this._getFindingById(finding_id);
    if (!finding) throw new Error('Finding not found');

    finding.finding_status = 'RESOLVED';
    finding.resolved_by = resolved_by || null;
    finding.updated_at = new Date().toISOString();
    this._findings.set(finding_id, finding);

    const dbResult = await this._dbWrite(
      `UPDATE controlled_printhouse_handoff_findings SET finding_status = 'RESOLVED', resolved_by = ?, updated_at = NOW() WHERE finding_id = ?`,
      [resolved_by || null, finding_id]
    );
    const persistence = this._getPersistenceInfo(dbResult);

    await this._writeAudit(finding.handoff_package_id, finding.pilot_program_id, finding.participant_id, null, 'HANDOFF_FINDING_RESOLVED', resolved_by, { finding_id });

    return {
      finding,
      ...persistence,
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  async buildHandoffEvidencePack(payload) {
    const { handoff_package_id, pilot_program_id, participant_id } = payload || {};
    if (!handoff_package_id) throw new Error('handoff_package_id is required');

    const pkg = await this._getPackageById(handoff_package_id);
    if (!pkg) throw new Error('Handoff package not found');

    const allFindings = [];
    for (const [, f] of this._findings) {
      if (f.handoff_package_id === handoff_package_id) allFindings.push(f);
    }
    const dbFindings = await this._dbRead(
      'SELECT * FROM controlled_printhouse_handoff_findings WHERE handoff_package_id = ? ORDER BY created_at ASC',
      [handoff_package_id]
    );
    const findings = dbFindings || allFindings;
    const unresolvedBlockers = findings.filter(f => f.finding_status !== 'RESOLVED' && (f.blocks_handoff === true || f.blocks_handoff === 1));

    const allFiles = [];
    for (const [, f] of this._packageFiles) {
      if (f.handoff_package_id === handoff_package_id) allFiles.push(f);
    }
    const dbFiles = await this._dbRead(
      'SELECT * FROM controlled_printhouse_handoff_package_files WHERE handoff_package_id = ? ORDER BY created_at ASC',
      [handoff_package_id]
    );

    const allGrants = [];
    for (const [, g] of this._accessGrants) {
      if (g.handoff_package_id === handoff_package_id) allGrants.push(g);
    }
    const dbGrants = await this._dbRead(
      'SELECT * FROM controlled_printhouse_handoff_access_grants WHERE handoff_package_id = ? ORDER BY created_at ASC',
      [handoff_package_id]
    );

    const allAudits = [];
    for (const [, a] of this._audits) {
      if (a.handoff_package_id === handoff_package_id) allAudits.push(a);
    }

    const evidencePackId = crypto.randomUUID();
    const evidencePack = {
      evidence_pack_id: evidencePackId,
      evidence_schema_version: EVIDENCE_SCHEMA_VERSION,
      handoff_package_id,
      pilot_program_id: pkg.pilot_program_id,
      participant_id: pkg.participant_id,
      printhouse_tenant_id: pkg.printhouse_tenant_id,
      package_status: pkg.package_status,
      file_access_scope: pkg.file_access_scope,
      file_download_audit_required: pkg.file_download_audit_required,
      files_summary: {
        total: (dbFiles || allFiles).length,
      },
      access_grants_summary: {
        total: (dbGrants || allGrants).length,
        active: (dbGrants || allGrants).filter(g => g.grant_status === 'ACTIVE').length,
        revoked: (dbGrants || allGrants).filter(g => g.grant_status === 'REVOKED').length,
      },
      findings_summary: {
        total: findings.length,
        open: findings.filter(f => f.finding_status === 'OPEN').length,
        resolved: findings.filter(f => f.finding_status === 'RESOLVED').length,
        unresolved_blockers: unresolvedBlockers.length,
      },
      audit_summary: {
        total_events: allAudits.length,
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
      `INSERT INTO controlled_printhouse_handoff_evidence_packs
       (evidence_pack_id, handoff_package_id, pilot_program_id, participant_id, evidence_status, evidence_schema_version, evidence_hash, evidence_json, redaction_classification, generated_by)
       VALUES (?, ?, ?, ?, 'GENERATED', ?, ?, ?, 'INTERNAL_ONLY', 'system')`,
      [evidencePackId, handoff_package_id, pkg.pilot_program_id, pkg.participant_id,
       EVIDENCE_SCHEMA_VERSION, integrityHash, JSON.stringify(evidencePack)]
    );

    await this._writeAudit(handoff_package_id, pkg.pilot_program_id, pkg.participant_id, null, 'HANDOFF_EVIDENCE_PACK_BUILT', 'system', {
      evidence_pack_id: evidencePackId, integrity_hash: integrityHash, findings_total: findings.length, unresolved_blockers: unresolvedBlockers.length,
    });

    return {
      evidence_pack: evidencePack,
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  async getHandoffAuditTimeline(payload) {
    const { handoff_package_id, pilot_program_id } = payload || {};
    if (!handoff_package_id) throw new Error('handoff_package_id is required');

    const memAudits = [];
    for (const [, a] of this._audits) {
      if (a.handoff_package_id === handoff_package_id) memAudits.push(a);
    }

    const dbRows = await this._dbRead(
      'SELECT * FROM controlled_printhouse_handoff_audits WHERE handoff_package_id = ? ORDER BY created_at ASC',
      [handoff_package_id]
    );

    return {
      audit_timeline: dbRows || memAudits,
      source: dbRows ? 'DB' : 'MEMORY',
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  async getReadiness(payload) {
    const { handoff_package_id } = payload || {};

    const readiness = {
      phase122_1_validated: false,
      phase122_2_validated: false,
      phase123_validated: false,
      migration_065_applied: false,
      migration_066_applied: false,
      migration_067_applied: false,
      migration_068_applied: false,
      db_available: !!this._db,
      tenant_allowlist_fail_closed: !(process.env.NODE_ENV === 'test' || process.env.ALLOW_UNSCOPED_PILOT_TENANTS_FOR_TESTS === 'true') || !!(process.env.PILOT_TENANT_ALLOWLIST),
    };

    const schemaRows = await this._dbRead(
      "SELECT version FROM schema_versions WHERE version IN ('065', '066', '067', '068') ORDER BY version ASC", []
    );
    if (schemaRows) {
      for (const row of schemaRows) {
        if (String(row.version) === '065') readiness.migration_065_applied = true;
        if (String(row.version) === '066') readiness.migration_066_applied = true;
        if (String(row.version) === '067') readiness.migration_067_applied = true;
        if (String(row.version) === '068') readiness.migration_068_applied = true;
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

    const ev3 = await this._dbRead(
      "SELECT evidence_pack_id FROM founding_printhouse_pilot_evidence_packs WHERE evidence_status = 'GENERATED' LIMIT 1", []
    );
    if (ev3 && ev3.length > 0) readiness.phase123_validated = true;

    let pkg = null;
    if (handoff_package_id) {
      pkg = await this._getPackageById(handoff_package_id);
    }

    return {
      readiness,
      handoff_package: pkg,
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  // --- Internal lookup helpers ---

  async _getPackageById(id) {
    if (this._packages.has(id)) return this._packages.get(id);
    const rows = await this._dbRead('SELECT * FROM controlled_printhouse_handoff_packages WHERE handoff_package_id = ?', [id]);
    if (rows && rows.length > 0) { this._packages.set(id, rows[0]); return rows[0]; }
    return null;
  }

  async _getAccessGrantById(id) {
    if (this._accessGrants.has(id)) return this._accessGrants.get(id);
    const rows = await this._dbRead('SELECT * FROM controlled_printhouse_handoff_access_grants WHERE access_grant_id = ?', [id]);
    if (rows && rows.length > 0) { this._accessGrants.set(id, rows[0]); return rows[0]; }
    return null;
  }

  async _getFindingById(id) {
    if (this._findings.has(id)) return this._findings.get(id);
    const rows = await this._dbRead('SELECT * FROM controlled_printhouse_handoff_findings WHERE finding_id = ?', [id]);
    if (rows && rows.length > 0) { this._findings.set(id, rows[0]); return rows[0]; }
    return null;
  }

  async _getParticipantFromPhase123(id) {
    if (this._phase123Service) {
      const p = await this._phase123Service._getParticipantById(id);
      if (p) return p;
    }
    const rows = await this._dbRead('SELECT * FROM founding_printhouse_pilot_participants WHERE participant_id = ?', [id]);
    if (rows && rows.length > 0) return rows[0];
    try {
      const FoundingPrinthousePilotGateService = require('./foundingPrinthousePilotGateService');
      const p123 = new FoundingPrinthousePilotGateService();
      return await p123._getParticipantById(id);
    } catch (_e) {
      return null;
    }
  }

  async _getUnresolvedBlockerFindings(handoffPackageId) {
    const memBlockers = [];
    for (const [, f] of this._findings) {
      if (f.handoff_package_id === handoffPackageId && f.finding_status !== 'RESOLVED' && f.blocks_handoff) {
        memBlockers.push(f);
      }
    }

    const dbRows = await this._dbRead(
      "SELECT * FROM controlled_printhouse_handoff_findings WHERE handoff_package_id = ? AND finding_status != 'RESOLVED' AND blocks_handoff = 1",
      [handoffPackageId]
    );

    return dbRows || memBlockers;
  }
}

module.exports = ControlledPrinthouseHandoffPackageService;
