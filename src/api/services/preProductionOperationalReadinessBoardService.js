'use strict';

const crypto = require('crypto');

const DEPARTMENTS = [
  'OPERATIONS',
  'FINANCE',
  'TECHNICAL',
  'COMPLIANCE',
  'SECURITY',
  'CUSTOMER_SUPPORT',
  'PRINT_PARTNER_SUCCESS',
];

const BOARD_STATUSES = {
  DRAFT: 'DRAFT',
  IN_REVIEW: 'IN_REVIEW',
  CHANGES_REQUIRED: 'CHANGES_REQUIRED',
  READY_FOR_SIGN_OFF: 'READY_FOR_SIGN_OFF',
  SIGNED_OFF: 'SIGNED_OFF_FOR_CONTROLLED_PRODUCTION_REVIEW',
  REJECTED: 'REJECTED',
};

const SAFETY_FLAGS = Object.freeze({
  review_only: true,
  production_activation_enabled: false,
  full_public_enabled: false,
  live_provider_connectivity_enabled: false,
  payment_execution_enabled: false,
  refund_execution_enabled: false,
  payout_execution_enabled: false,
  external_submission_enabled: false,
  source_mutation_enabled: false,
});

const SAFETY_MARKERS = Object.freeze({
  reviewOnly: true,
  productionActivationEnabled: false,
  fullPublicEnabled: false,
  liveProviderConnectivityEnabled: false,
  paymentExecutionEnabled: false,
  refundExecutionEnabled: false,
  payoutExecutionEnabled: false,
  externalSubmission: false,
  sourceMutation: false,
});

const PHASE_SAFETY_STRING =
  'PHASE_115_REVIEW_ONLY. No production activation, live provider connectivity, ' +
  'payment execution, refund execution, payout execution, external submission, ' +
  'or source record mutation will occur.';

class PreProductionOperationalReadinessBoardService {
  constructor() {
    this._boards = new Map();
    this._reviews = new Map();
    this._findings = new Map();
    this._audits = new Map();

    let _db = null;
    try {
      _db = require('./mysqlClient');
    } catch (_) {
      // DB unavailable — in-memory fallback for smoke/test environments
    }
    this._db = _db;
  }

  _safetyFlags() {
    return { ...SAFETY_FLAGS };
  }

  _safetyMarkers() {
    return { ...SAFETY_MARKERS };
  }

  _uid() {
    return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
  }

  _writeAudit(boardId, eventType, actor, department, details) {
    const audit = {
      audit_id: `audit-${this._uid()}`,
      board_id: boardId,
      event_type: eventType,
      actor: actor || 'system',
      department: department || null,
      details_json: details || {},
      review_only: true,
      created_at: new Date().toISOString(),
    };
    if (!this._audits.has(boardId)) this._audits.set(boardId, []);
    this._audits.get(boardId).push(audit);

    if (this._db) {
      this._db.query(
        `INSERT INTO pre_production_readiness_board_audits
         (audit_id, board_id, event_type, actor, department, details_json, review_only)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [audit.audit_id, boardId, eventType, audit.actor, audit.department,
          JSON.stringify(audit.details_json), 1]
      ).catch(() => {});
    }

    return audit;
  }

  async createBoardReview(payload = {}) {
    const boardId = payload.board_id || `board-${this._uid()}`;
    const dryRunRef = payload.dry_run_reference_id || 'dry-run-ref-placeholder';
    const requestedBy = payload.requested_by || 'system';

    const deptReviews = DEPARTMENTS.map(dept => ({
      review_id: `rev-${dept.toLowerCase()}-${this._uid()}`,
      board_id: boardId,
      department: dept,
      reviewer: payload[`reviewer_${dept.toLowerCase()}`] || 'TBD',
      status: 'PENDING',
      review_only: true,
      created_at: new Date().toISOString(),
    }));

    const board = {
      board_id: boardId,
      dry_run_reference_id: dryRunRef,
      requested_by: requestedBy,
      status: BOARD_STATUSES.DRAFT,
      ...this._safetyFlags(),
      departments_json: deptReviews,
      findings_summary_json: { open: 0, blockers: 0, resolved: 0 },
      created_at: new Date().toISOString(),
    };

    this._boards.set(boardId, board);
    this._reviews.set(boardId, deptReviews);

    if (this._db) {
      await this._db.query(
        `INSERT INTO pre_production_readiness_boards
         (board_id, dry_run_reference_id, requested_by, status,
          review_only, production_activation_enabled, full_public_enabled,
          live_provider_connectivity_enabled, payment_execution_enabled,
          refund_execution_enabled, payout_execution_enabled,
          external_submission_enabled, source_mutation_enabled,
          departments_json, findings_summary_json)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [boardId, dryRunRef, requestedBy, board.status,
          1, 0, 0, 0, 0, 0, 0, 0, 0,
          JSON.stringify(deptReviews),
          JSON.stringify(board.findings_summary_json)]
      ).catch(() => {});
    }

    this._writeAudit(boardId, 'BOARD_CREATED', requestedBy, null, { board_id: boardId });

    return {
      board_id: boardId,
      status: board.status,
      departments: deptReviews,
      safety: this._safetyMarkers(),
      phase_safety: PHASE_SAFETY_STRING,
    };
  }

  async evaluateBoardReadiness(payload = {}) {
    const boardId = payload.board_id;
    const board = boardId ? this._boards.get(boardId) : null;
    const reviews = boardId ? (this._reviews.get(boardId) || []) : [];
    const findings = boardId ? [...(this._findings.get(boardId) || [])] : [];

    const openBlockers = findings.filter(f => f.severity === 'BLOCKER' && f.status === 'OPEN');
    const pendingDepts = reviews.filter(r => r.status === 'PENDING').map(r => r.department);
    const allApproved = reviews.length > 0 && reviews.every(r => r.status === 'APPROVED');

    const readiness = openBlockers.length === 0 && allApproved
      ? 'READY_FOR_SIGN_OFF'
      : 'NOT_READY';

    const blockers = [];
    if (openBlockers.length > 0) blockers.push(`${openBlockers.length} open blocker finding(s)`);
    if (pendingDepts.length > 0) blockers.push(`Pending reviews: ${pendingDepts.join(', ')}`);

    this._writeAudit(boardId || 'unknown', 'BOARD_READINESS_EVALUATED', payload.actor || 'system', null,
      { readiness, blockers });

    return {
      board_id: boardId || null,
      readiness,
      blockers,
      open_blockers: openBlockers.length,
      pending_departments: pendingDepts,
      all_departments_approved: allApproved,
      safety: this._safetyMarkers(),
      phase_safety: PHASE_SAFETY_STRING,
    };
  }

  async submitDepartmentReview(payload = {}) {
    const { board_id, department, reviewer, status, notes } = payload;

    if (!board_id) throw new Error('board_id is required');
    if (!department || !DEPARTMENTS.includes(department)) {
      throw new Error(`department must be one of: ${DEPARTMENTS.join(', ')}`);
    }
    const allowedStatuses = ['APPROVED', 'CHANGES_REQUIRED', 'REJECTED'];
    if (!status || !allowedStatuses.includes(status)) {
      throw new Error(`status must be one of: ${allowedStatuses.join(', ')}`);
    }

    const reviews = this._reviews.get(board_id) || [];
    const review = reviews.find(r => r.department === department);
    if (review) {
      review.status = status;
      review.reviewer = reviewer || review.reviewer;
      review.notes = notes || null;
      review.submitted_at = new Date().toISOString();
    } else {
      const newReview = {
        review_id: `rev-${department.toLowerCase()}-${this._uid()}`,
        board_id,
        department,
        reviewer: reviewer || 'unknown',
        status,
        notes: notes || null,
        review_only: true,
        submitted_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };
      reviews.push(newReview);
      this._reviews.set(board_id, reviews);
    }

    const board = this._boards.get(board_id);
    if (board) {
      const allApproved = reviews.every(r => r.status === 'APPROVED');
      const anyRejected = reviews.some(r => r.status === 'REJECTED');
      const anyChanges = reviews.some(r => r.status === 'CHANGES_REQUIRED');
      if (allApproved) board.status = BOARD_STATUSES.READY_FOR_SIGN_OFF;
      else if (anyRejected) board.status = BOARD_STATUSES.REJECTED;
      else if (anyChanges) board.status = BOARD_STATUSES.CHANGES_REQUIRED;
      else board.status = BOARD_STATUSES.IN_REVIEW;
    }

    this._writeAudit(board_id, 'DEPARTMENT_REVIEW_SUBMITTED', reviewer || 'system', department,
      { status, notes });

    return {
      board_id,
      department,
      review_status: status,
      board_status: board ? board.status : null,
      review_only: true,
      safety: this._safetyMarkers(),
      phase_safety: PHASE_SAFETY_STRING,
    };
  }

  async recordFinding(payload = {}) {
    const { board_id, department, severity, title, description, raised_by } = payload;

    if (!board_id) throw new Error('board_id is required');
    if (!title) throw new Error('title is required');

    const findingId = `finding-${this._uid()}`;
    const finding = {
      finding_id: findingId,
      board_id,
      department: department || 'TECHNICAL',
      severity: severity || 'MAJOR',
      title,
      description: description || null,
      resolution: null,
      status: 'OPEN',
      raised_by: raised_by || 'system',
      resolved_by: null,
      review_only: true,
      blocks_sign_off: (severity === 'BLOCKER'),
      raised_at: new Date().toISOString(),
    };

    if (!this._findings.has(board_id)) this._findings.set(board_id, []);
    this._findings.get(board_id).push(finding);

    this._writeAudit(board_id, 'FINDING_RECORDED', raised_by || 'system', department,
      { finding_id: findingId, severity, title });

    return {
      finding_id: findingId,
      board_id,
      status: finding.status,
      severity: finding.severity,
      blocks_sign_off: finding.blocks_sign_off,
      review_only: true,
      safety: this._safetyMarkers(),
      phase_safety: PHASE_SAFETY_STRING,
    };
  }

  async resolveFinding(payload = {}) {
    const { board_id, finding_id, resolution, resolved_by } = payload;

    if (!board_id) throw new Error('board_id is required');
    if (!finding_id) throw new Error('finding_id is required');

    const findings = this._findings.get(board_id) || [];
    const finding = findings.find(f => f.finding_id === finding_id);
    if (finding) {
      finding.status = 'RESOLVED';
      finding.resolution = resolution || 'Resolved';
      finding.resolved_by = resolved_by || 'system';
      finding.resolved_at = new Date().toISOString();
    }

    this._writeAudit(board_id, 'FINDING_RESOLVED', resolved_by || 'system', null,
      { finding_id, resolution });

    return {
      finding_id,
      board_id,
      status: 'RESOLVED',
      resolved_by: resolved_by || 'system',
      review_only: true,
      safety: this._safetyMarkers(),
      phase_safety: PHASE_SAFETY_STRING,
    };
  }

  async buildBoardEvidencePack(payload = {}) {
    const { board_id } = payload;
    if (!board_id) throw new Error('board_id is required');

    const board = this._boards.get(board_id) || { board_id, status: 'UNKNOWN' };
    const reviews = this._reviews.get(board_id) || [];
    const findings = this._findings.get(board_id) || [];
    const audits = this._audits.get(board_id) || [];

    const openFindings = findings.filter(f => f.status === 'OPEN');
    const resolvedFindings = findings.filter(f => f.status === 'RESOLVED');
    const blockerFindings = findings.filter(f => f.severity === 'BLOCKER' && f.status === 'OPEN');

    this._writeAudit(board_id, 'EVIDENCE_PACK_BUILT', payload.actor || 'system', null, {});

    return {
      board_id,
      dry_run_reference_id: board.dry_run_reference_id || null,
      board_status: board.status,
      departments_reviewed: reviews.map(r => ({ department: r.department, status: r.status })),
      findings_summary: {
        total: findings.length,
        open: openFindings.length,
        resolved: resolvedFindings.length,
        blockers: blockerFindings.length,
      },
      audit_summary: audits.map(a => ({ event_type: a.event_type, created_at: a.created_at })),
      safety_invariants: this._safetyFlags(),
      safety: this._safetyMarkers(),
      phase_safety: PHASE_SAFETY_STRING,
      evidence_generated_at: new Date().toISOString(),
    };
  }

  async getBoardAuditTimeline(payload = {}) {
    const { board_id } = payload;
    if (!board_id) throw new Error('board_id is required');

    const audits = this._audits.get(board_id) || [];
    return {
      board_id,
      audit_timeline: audits,
      review_only: true,
      safety: this._safetyMarkers(),
      phase_safety: PHASE_SAFETY_STRING,
    };
  }
}

module.exports = PreProductionOperationalReadinessBoardService;
