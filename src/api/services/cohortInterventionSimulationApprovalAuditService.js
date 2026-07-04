'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');

class CohortInterventionSimulationApprovalAuditService {
  constructor() {
    this._mockState = {
      auditEvents: new Map()
    };
  }

  async recordAuditEvent(approvalId, eventType, actorId, details = {}) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const auditEventId = 'apa_' + crypto.randomBytes(8).toString('hex');
    const created = new Date();

    const auditEvent = {
      audit_event_id: auditEventId,
      approval_id: approvalId,
      event_type: eventType,
      actor_id: actorId,
      details_json: details,
      created_at: created
    };

    if (!isProdLike) {
      if (!this._mockState.auditEvents.has(approvalId)) {
        this._mockState.auditEvents.set(approvalId, []);
      }
      this._mockState.auditEvents.get(approvalId).push(auditEvent);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_cohort_intervention_approval_audits
         (audit_event_id, approval_id, event_type, actor_id, details_json)
         VALUES (?, ?, ?, ?, ?)`,
        [auditEventId, approvalId, eventType, actorId, JSON.stringify(details)]
      );
    }
    return auditEvent;
  }

  async getAuditEvents(approvalId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      return this._mockState.auditEvents.get(approvalId) || [];
    } else {
      return await db.query(
        `SELECT * FROM controlled_beta_cohort_intervention_approval_audits
         WHERE approval_id = ? ORDER BY created_at ASC`,
        [approvalId]
      );
    }
  }
}

const serviceInstance = new CohortInterventionSimulationApprovalAuditService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
module.exports.CohortInterventionSimulationApprovalAuditService = CohortInterventionSimulationApprovalAuditService;
