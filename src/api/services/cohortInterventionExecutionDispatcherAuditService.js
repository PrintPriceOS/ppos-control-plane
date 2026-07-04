'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');

class CohortInterventionExecutionDispatcherAuditService {
  constructor() {
    this._mockState = {
      audits: new Map()
    };
  }

  async createAuditLog(dispatcherId, eventType, actorId, detailsJson = {}) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const auditEventId = 'aud_148_' + crypto.randomBytes(8).toString('hex');
    const created = new Date();

    if (!isProdLike) {
      if (!this._mockState.audits.has(dispatcherId)) {
        this._mockState.audits.set(dispatcherId, []);
      }
      this._mockState.audits.get(dispatcherId).push({
        audit_event_id: auditEventId,
        dispatcher_id: dispatcherId,
        event_type: eventType,
        actor_id: actorId,
        details_json: detailsJson,
        created_at: created
      });
      return { auditEventId };
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_dispatcher_audits
       (audit_event_id, dispatcher_id, event_type, actor_id, details_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [auditEventId, dispatcherId, eventType, actorId, JSON.stringify(detailsJson), created]
    );
    return { auditEventId };
  }

  async getAuditLogs(dispatcherId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return this._mockState.audits.get(dispatcherId) || [];
    }

    return await db.query(
      `SELECT * FROM cb_cohort_intervention_dispatcher_audits
       WHERE dispatcher_id = ?
       ORDER BY created_at ASC`,
      [dispatcherId]
    );
  }
}

const serviceInstance = new CohortInterventionExecutionDispatcherAuditService();
module.exports = {
  CohortInterventionExecutionDispatcherAuditService,
  serviceInstance
};
