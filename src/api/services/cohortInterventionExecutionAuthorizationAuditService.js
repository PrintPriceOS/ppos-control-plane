'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');

class CohortInterventionExecutionAuthorizationAuditService {
  constructor() {
    this._mockState = {
      audits: new Map()
    };
  }

  async createAuditLog(authId, eventType, actorId, detailsJson = {}) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const auditEventId = 'aud_146_' + crypto.randomBytes(8).toString('hex');
    const created = new Date();

    if (!isProdLike) {
      if (!this._mockState.audits.has(authId)) {
        this._mockState.audits.set(authId, []);
      }
      this._mockState.audits.get(authId).push({
        audit_event_id: auditEventId,
        auth_id: authId,
        event_type: eventType,
        actor_id: actorId,
        details_json: detailsJson,
        created_at: created
      });
      return { auditEventId };
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_exec_auth_audits
       (audit_event_id, auth_id, event_type, actor_id, details_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [auditEventId, authId, eventType, actorId, JSON.stringify(detailsJson), created]
    );
    return { auditEventId };
  }

  async getAuditLogs(authId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return this._mockState.audits.get(authId) || [];
    }

    return await db.query(
      `SELECT * FROM cb_cohort_intervention_exec_auth_audits
       WHERE auth_id = ?
       ORDER BY created_at ASC`,
      [authId]
    );
  }
}

const serviceInstance = new CohortInterventionExecutionAuthorizationAuditService();
module.exports = {
  CohortInterventionExecutionAuthorizationAuditService,
  serviceInstance
};
