'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');

class RuntimeActivityReviewAuditService {
  constructor() {
    this._mockState = {
      audits: new Map()
    };
  }

  async recordAuditEvent(reviewId, eventType, actorId, details = {}) {
    const auditEventId = 'rae_' + crypto.randomBytes(8).toString('hex');
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      const list = this._mockState.audits.get(reviewId) || [];
      list.push({
        audit_event_id: auditEventId,
        review_id: reviewId,
        event_type: eventType,
        actor_id: actorId,
        details_json: details,
        created_at: new Date()
      });
      this._mockState.audits.set(reviewId, list);
    } else {
      await db.query(
        "INSERT INTO controlled_beta_runtime_activity_review_audit_events (audit_event_id, review_id, event_type, actor_id, details_json) VALUES (?, ?, ?, ?, ?)",
        [auditEventId, reviewId, eventType, actorId, JSON.stringify(details)]
      );
    }
    return auditEventId;
  }
}

const serviceInstance = new RuntimeActivityReviewAuditService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
