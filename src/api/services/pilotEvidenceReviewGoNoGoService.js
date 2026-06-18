'use strict';

const crypto = require('crypto');

const SAFETY_MARKERS = Object.freeze({
  pilotOnly: true,
  reviewOnly: true,
  decisionOnly: true,
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
  betaEnabled: false,
});

const SAFETY_FLAGS_DB = Object.freeze({
  pilot_only: true,
  review_only: true,
  decision_only: true,
  beta_enabled: false,
  production_activation_enabled: false,
  full_public_enabled: false,
  open_marketplace_enabled: false,
  payment_execution_enabled: false,
  refund_execution_enabled: false,
  payout_execution_enabled: false,
  provider_external_submission_enabled: false,
  external_tax_submission_enabled: false,
  external_accounting_submission_enabled: false,
  source_mutation_enabled: false,
});

const SAFETY_MESSAGE =
  'Pilot evidence review and Go/No-Go decision only. ' +
  'This does NOT enable limited beta automatically. ' +
  'FULL_PUBLIC and open marketplace access remain disabled. ' +
  'No real payment, refund, payout, tax submission, accounting submission, or provider execution.';

const EVIDENCE_SCHEMA_VERSION = '126.0';

const REDACTION_FIELDS = [
  'internal_customer_reference', 'raw_customer_data', 'raw_file_package_urls',
  'raw_preflight_artifact_paths', 'raw_invoice_data', 'secrets',
  'internal_file_paths', 'raw_internal_urls', 'raw_payment_credentials',
  'raw_provider_keys', 'raw_bank_account_data',
];

const REQUIRED_PHASE_CHECKS = [
  { key: 'PHASE_122_1_VALIDATED', label: 'Phase 122.1 Internal Order Lifecycle Hardening', phase: '122.1' },
  { key: 'PHASE_122_2_VALIDATED', label: 'Phase 122.2 Runtime Verification / Recovery Drill', phase: '122.2' },
  { key: 'PHASE_123_VALIDATED', label: 'Phase 123 Founding Printhouse Pilot Gate', phase: '123' },
  { key: 'PHASE_124_VALIDATED', label: 'Phase 124 Controlled Printhouse Handoff / File Package', phase: '124' },
  { key: 'PHASE_125_VALIDATED', label: 'Phase 125 Sandbox Commercial / Invoice / Payment Handoff', phase: '125' },
  { key: 'MIGRATION_RUNNER_CLEAN', label: 'Migration runner clean', phase: null },
  { key: 'NPM_BUILD_PASSING', label: 'npm build passing', phase: null },
  { key: 'DB_BACKUP_EVIDENCE', label: 'DB backup evidence present', phase: null },
  { key: 'NO_UNRESOLVED_BLOCKERS', label: 'No unresolved blocker findings', phase: null },
  { key: 'TENANT_ALLOWLIST_FAIL_CLOSED', label: 'Tenant allowlist fail-closed', phase: null },
  { key: 'FILE_ACCESS_SCOPED_REVOCABLE', label: 'File access grants scoped and revocable', phase: null },
  { key: 'NO_REAL_PAYMENT_EXECUTION', label: 'No real payment execution', phase: null },
  { key: 'NO_PROVIDER_EXTERNAL_SUBMISSION', label: 'No provider external submission', phase: null },
  { key: 'NO_FULL_PUBLIC', label: 'No FULL_PUBLIC enabled', phase: null },
  { key: 'NO_OPEN_MARKETPLACE', label: 'No open marketplace enabled', phase: null },
];

const DECISION_STATUSES = ['DRAFT', 'IN_REVIEW', 'CHANGES_REQUIRED', 'GO_FOR_LIMITED_BETA_PREPARATION', 'NO_GO', 'DEFERRED'];

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

function _id(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

function _hash(data) {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

function _redact(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = Array.isArray(obj) ? [] : {};
  for (const k of Object.keys(obj)) {
    if (REDACTION_FIELDS.includes(k)) { out[k] = '[REDACTED]'; continue; }
    out[k] = typeof obj[k] === 'object' && obj[k] !== null ? _redact(obj[k]) : obj[k];
  }
  return out;
}

class PilotEvidenceReviewGoNoGoService {
  constructor(opts) {
    this._boards = new Map();
    this._checks = new Map();
    this._findings = new Map();
    this._decisions = new Map();
    this._audits = new Map();
    this._evidencePacks = new Map();
  }

  _writeAudit(boardId, eventType, detail, actor) {
    const audit = {
      audit_id: _id('pera'),
      review_board_id: boardId,
      decision_id: null,
      event_type: eventType,
      event_detail_json: detail || {},
      safety_snapshot_json: { ...SAFETY_MARKERS },
      actor: actor || 'system',
      created_at: new Date().toISOString(),
    };
    const list = this._audits.get(boardId) || [];
    list.push(audit);
    this._audits.set(boardId, list);
    return audit;
  }

  async createReviewBoard(params) {
    const boardId = _id('perb');
    const board = {
      review_board_id: boardId,
      phase: 'PHASE_126',
      board_status: 'DRAFT',
      board_name: (params && params.board_name) || 'Pilot Evidence Review Board',
      board_description: (params && params.board_description) || null,
      review_scope_json: (params && params.review_scope_json) || null,
      ...SAFETY_FLAGS_DB,
      created_by: (params && params.created_by) || 'system',
      created_at: new Date().toISOString(),
      updated_at: null,
    };
    this._boards.set(boardId, board);
    this._writeAudit(boardId, 'REVIEW_BOARD_CREATED', { review_board_id: boardId }, board.created_by);
    return { review_board: board, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async aggregatePilotEvidence(params) {
    const boardId = params && params.review_board_id;
    const board = this._boards.get(boardId);
    if (!board && !_isDbFallbackAllowed()) {
      throw new Error('Review board not found and DB fallback not allowed');
    }

    const checks = [];
    for (const rc of REQUIRED_PHASE_CHECKS) {
      const checkId = _id('perc');
      const provided = params && params.evidence && params.evidence[rc.key];
      const check = {
        review_check_id: checkId,
        review_board_id: boardId,
        check_key: rc.key,
        check_label: rc.label,
        check_status: provided ? 'VERIFIED' : 'UNVERIFIED',
        check_evidence_json: provided || null,
        check_notes: null,
        phase_reference: rc.phase,
        verified_at: provided ? new Date().toISOString() : null,
        verified_by: (params && params.verified_by) || null,
        created_at: new Date().toISOString(),
        updated_at: null,
      };
      checks.push(check);
      this._checks.set(checkId, check);
    }

    if (board) {
      board.board_status = 'IN_REVIEW';
      board.updated_at = new Date().toISOString();
    }

    this._writeAudit(boardId, 'PILOT_EVIDENCE_AGGREGATED', {
      total_checks: checks.length,
      verified: checks.filter(c => c.check_status === 'VERIFIED').length,
      unverified: checks.filter(c => c.check_status === 'UNVERIFIED').length,
    }, (params && params.verified_by) || 'system');

    return {
      review_board_id: boardId,
      checks,
      summary: {
        total: checks.length,
        verified: checks.filter(c => c.check_status === 'VERIFIED').length,
        unverified: checks.filter(c => c.check_status === 'UNVERIFIED').length,
      },
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  async evaluateLimitedBetaReadiness(params) {
    const boardId = params && params.review_board_id;
    const board = this._boards.get(boardId);
    if (!board && !_isDbFallbackAllowed()) {
      throw new Error('Review board not found and DB fallback not allowed');
    }

    const allChecks = [];
    for (const [, c] of this._checks) {
      if (c.review_board_id === boardId) allChecks.push(c);
    }

    const allFindings = [];
    for (const [, f] of this._findings) {
      if (f.review_board_id === boardId) allFindings.push(f);
    }

    const unresolvedBlockers = allFindings.filter(
      f => f.blocks_go_decision && f.finding_status !== 'RESOLVED'
    );

    const verifiedCount = allChecks.filter(c => c.check_status === 'VERIFIED').length;
    const totalCount = allChecks.length;
    const allChecksVerified = totalCount > 0 && verifiedCount === totalCount;
    const noBlockers = unresolvedBlockers.length === 0;

    let readiness_status;
    if (allChecksVerified && noBlockers) {
      readiness_status = 'READY_FOR_GO_DECISION';
    } else if (unresolvedBlockers.length > 0) {
      readiness_status = 'BLOCKED_BY_FINDINGS';
    } else {
      readiness_status = 'CHECKS_INCOMPLETE';
    }

    this._writeAudit(boardId, 'LIMITED_BETA_READINESS_EVALUATED', {
      readiness_status,
      verified: verifiedCount,
      total: totalCount,
      unresolved_blockers: unresolvedBlockers.length,
    }, (params && params.evaluated_by) || 'system');

    return {
      review_board_id: boardId,
      readiness_status,
      checks_summary: { total: totalCount, verified: verifiedCount, unverified: totalCount - verifiedCount },
      unresolved_blockers: unresolvedBlockers.map(f => ({
        finding_id: f.finding_id, severity: f.severity, summary: f.summary,
      })),
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  async recordReviewFinding(params) {
    const boardId = params && params.review_board_id;
    const board = this._boards.get(boardId);
    if (!board && !_isDbFallbackAllowed()) {
      throw new Error('Review board not found and DB fallback not allowed');
    }

    const findingId = _id('perf');
    const finding = {
      finding_id: findingId,
      review_board_id: boardId,
      finding_type: (params && params.finding_type) || 'OBSERVATION',
      finding_status: 'OPEN',
      blocks_go_decision: (params && params.blocks_go_decision) || false,
      severity: (params && params.severity) || 'LOW',
      summary: (params && params.summary) || null,
      details_json: (params && params.details_json) || null,
      resolved_at: null,
      resolved_by: null,
      created_by: (params && params.created_by) || 'system',
      created_at: new Date().toISOString(),
      updated_at: null,
    };
    this._findings.set(findingId, finding);

    this._writeAudit(boardId, 'REVIEW_FINDING_RECORDED', {
      finding_id: findingId, blocks_go_decision: finding.blocks_go_decision, severity: finding.severity,
    }, finding.created_by);

    return { finding, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async resolveReviewFinding(params) {
    const findingId = params && params.finding_id;
    const finding = this._findings.get(findingId);
    if (!finding && !_isDbFallbackAllowed()) {
      throw new Error('Finding not found and DB fallback not allowed');
    }
    if (!finding) {
      return { finding: null, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
    }

    finding.finding_status = 'RESOLVED';
    finding.resolved_at = new Date().toISOString();
    finding.resolved_by = (params && params.resolved_by) || 'system';
    finding.updated_at = new Date().toISOString();

    this._writeAudit(finding.review_board_id, 'REVIEW_FINDING_RESOLVED', {
      finding_id: findingId,
    }, finding.resolved_by);

    return { finding, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async submitGoNoGoDecision(params) {
    const boardId = params && params.review_board_id;
    const board = this._boards.get(boardId);
    if (!board && !_isDbFallbackAllowed()) {
      throw new Error('Review board not found and DB fallback not allowed');
    }

    const outcome = (params && params.decision_outcome) || 'NO_GO';
    if (!DECISION_STATUSES.includes(outcome) && !['GO_FOR_LIMITED_BETA_PREPARATION', 'NO_GO', 'DEFERRED', 'CHANGES_REQUIRED'].includes(outcome)) {
      throw new Error(`Invalid decision outcome: ${outcome}`);
    }

    const allFindings = [];
    for (const [, f] of this._findings) {
      if (f.review_board_id === boardId) allFindings.push(f);
    }
    const unresolvedBlockers = allFindings.filter(
      f => f.blocks_go_decision && f.finding_status !== 'RESOLVED'
    );

    if (outcome === 'GO_FOR_LIMITED_BETA_PREPARATION' && unresolvedBlockers.length > 0) {
      this._writeAudit(boardId, 'GO_DECISION_BLOCKED_BY_FINDINGS', {
        unresolved_blockers: unresolvedBlockers.length,
      }, (params && params.decided_by) || 'system');

      return {
        decision: null,
        blocked: true,
        reason: 'Unresolved blocker findings prevent GO decision',
        unresolved_blockers: unresolvedBlockers.map(f => ({
          finding_id: f.finding_id, severity: f.severity, summary: f.summary,
        })),
        safety: SAFETY_MARKERS,
        safety_message: SAFETY_MESSAGE,
      };
    }

    const allChecks = [];
    for (const [, c] of this._checks) {
      if (c.review_board_id === boardId) allChecks.push(c);
    }

    const decisionId = _id('pegng');
    const decision = {
      decision_id: decisionId,
      review_board_id: boardId,
      decision_status: outcome,
      decision_outcome: outcome,
      decision_rationale: (params && params.decision_rationale) || null,
      readiness_snapshot_json: {
        total_checks: allChecks.length,
        verified_checks: allChecks.filter(c => c.check_status === 'VERIFIED').length,
        unverified_checks: allChecks.filter(c => c.check_status !== 'VERIFIED').length,
        total_findings: allFindings.length,
        unresolved_blockers: unresolvedBlockers.length,
        safety_markers: { ...SAFETY_MARKERS },
      },
      unresolved_blockers_count: unresolvedBlockers.length,
      total_checks_count: allChecks.length,
      passed_checks_count: allChecks.filter(c => c.check_status === 'VERIFIED').length,
      failed_checks_count: allChecks.filter(c => c.check_status !== 'VERIFIED').length,
      betaEnabled: false,
      productionActivationEnabled: false,
      fullPublicEnabled: false,
      openMarketplaceEnabled: false,
      paymentExecutionEnabled: false,
      refundExecutionEnabled: false,
      payoutExecutionEnabled: false,
      providerExternalSubmissionEnabled: false,
      externalTaxSubmissionEnabled: false,
      externalAccountingSubmissionEnabled: false,
      sourceMutationEnabled: false,
      decided_by: (params && params.decided_by) || 'system',
      decided_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: null,
    };
    this._decisions.set(decisionId, decision);

    if (board) {
      board.board_status = outcome === 'GO_FOR_LIMITED_BETA_PREPARATION' ? 'GO_DECIDED' : outcome;
      board.updated_at = new Date().toISOString();
    }

    this._writeAudit(boardId, 'GO_NO_GO_DECISION_SUBMITTED', {
      decision_id: decisionId,
      outcome,
      beta_enabled: false,
      production_activation_enabled: false,
    }, decision.decided_by);

    return {
      decision,
      blocked: false,
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }

  async buildPilotReviewEvidencePack(params) {
    const boardId = params && params.review_board_id;
    const board = this._boards.get(boardId);
    if (!board && !_isDbFallbackAllowed()) {
      throw new Error('Review board not found and DB fallback not allowed');
    }

    const allChecks = [];
    for (const [, c] of this._checks) {
      if (c.review_board_id === boardId) allChecks.push(c);
    }

    const allFindings = [];
    for (const [, f] of this._findings) {
      if (f.review_board_id === boardId) allFindings.push(f);
    }

    const allDecisions = [];
    for (const [, d] of this._decisions) {
      if (d.review_board_id === boardId) allDecisions.push(d);
    }

    const evidenceData = {
      review_board: board ? _redact(board) : null,
      checks: allChecks.map(c => _redact(c)),
      findings: allFindings.map(f => _redact(f)),
      decisions: allDecisions.map(d => _redact(d)),
      safety_markers: { ...SAFETY_MARKERS },
      safety_message: SAFETY_MESSAGE,
      summary: {
        total_checks: allChecks.length,
        verified_checks: allChecks.filter(c => c.check_status === 'VERIFIED').length,
        unverified_checks: allChecks.filter(c => c.check_status !== 'VERIFIED').length,
        total_findings: allFindings.length,
        open_findings: allFindings.filter(f => f.finding_status === 'OPEN').length,
        unresolved_blockers: allFindings.filter(f => f.blocks_go_decision && f.finding_status !== 'RESOLVED').length,
        total_decisions: allDecisions.length,
      },
      generated_at: new Date().toISOString(),
    };

    const evidenceHash = _hash(evidenceData);
    const packId = _id('perp');
    const pack = {
      evidence_pack_id: packId,
      review_board_id: boardId,
      decision_id: allDecisions.length > 0 ? allDecisions[allDecisions.length - 1].decision_id : null,
      evidence_status: 'GENERATED',
      evidence_data_json: evidenceData,
      evidence_hash: evidenceHash,
      evidence_schema_version: EVIDENCE_SCHEMA_VERSION,
      redaction_classification: 'INTERNAL_ONLY',
      generated_at: new Date().toISOString(),
      generated_by: (params && params.generated_by) || 'system',
    };
    this._evidencePacks.set(packId, pack);

    this._writeAudit(boardId, 'PILOT_REVIEW_EVIDENCE_PACK_GENERATED', {
      evidence_pack_id: packId, evidence_hash: evidenceHash,
    }, pack.generated_by);

    return { evidence_pack: pack, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async getPilotReviewAuditTimeline(params) {
    const boardId = params && params.review_board_id;
    const audits = this._audits.get(boardId) || [];
    return { review_board_id: boardId, audits, safety: SAFETY_MARKERS, safety_message: SAFETY_MESSAGE };
  }

  async getReadiness(params) {
    const boardId = params && params.review_board_id;

    const allChecks = [];
    if (boardId) {
      for (const [, c] of this._checks) {
        if (c.review_board_id === boardId) allChecks.push(c);
      }
    }

    const allFindings = [];
    if (boardId) {
      for (const [, f] of this._findings) {
        if (f.review_board_id === boardId) allFindings.push(f);
      }
    }

    return {
      phase: 'PHASE_126',
      service: 'pilotEvidenceReviewGoNoGoService',
      status: 'OPERATIONAL',
      required_phase_checks: REQUIRED_PHASE_CHECKS,
      decision_statuses: DECISION_STATUSES,
      review_board_id: boardId || null,
      checks_summary: boardId ? {
        total: allChecks.length,
        verified: allChecks.filter(c => c.check_status === 'VERIFIED').length,
        unverified: allChecks.filter(c => c.check_status !== 'VERIFIED').length,
      } : null,
      findings_summary: boardId ? {
        total: allFindings.length,
        open: allFindings.filter(f => f.finding_status === 'OPEN').length,
        blockers: allFindings.filter(f => f.blocks_go_decision && f.finding_status !== 'RESOLVED').length,
      } : null,
      safety: SAFETY_MARKERS,
      safety_message: SAFETY_MESSAGE,
    };
  }
}

module.exports = PilotEvidenceReviewGoNoGoService;
