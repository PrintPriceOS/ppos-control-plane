'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');

class CohortInterventionSimulationReviewAuditService {
  constructor() {
    this._mockState = {
      auditEvents: new Map()
    };
  }

  async recordAuditEvent(reviewId, eventType, actorId, details = {}) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const auditEventId = 'sra_' + crypto.randomBytes(8).toString('hex');
    const created = new Date();

    const auditEvent = {
      audit_event_id: auditEventId,
      review_id: reviewId,
      event_type: eventType,
      actor_id: actorId,
      details_json: details,
      created_at: created
    };

    if (!isProdLike) {
      if (!this._mockState.auditEvents.has(reviewId)) {
        this._mockState.auditEvents.set(reviewId, []);
      }
      this._mockState.auditEvents.get(reviewId).push(auditEvent);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_cohort_intervention_sim_review_audit_events
         (audit_event_id, review_id, event_type, actor_id, details_json)
         VALUES (?, ?, ?, ?, ?)`,
        [auditEventId, reviewId, eventType, actorId, JSON.stringify(details)]
      );
    }

    return auditEvent;
  }

  async getAuditEvents(reviewId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      return this._mockState.auditEvents.get(reviewId) || [];
    } else {
      return await db.query(
        `SELECT * FROM controlled_beta_cohort_intervention_sim_review_audit_events
         WHERE review_id = ? ORDER BY created_at ASC`,
        [reviewId]
      );
    }
  }
}

const serviceInstance = new CohortInterventionSimulationReviewAuditService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
module.exports.CohortInterventionSimulationReviewAuditService = CohortInterventionSimulationReviewAuditService;
