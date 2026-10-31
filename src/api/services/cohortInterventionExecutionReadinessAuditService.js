'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');

class CohortInterventionExecutionReadinessAuditService {
  constructor() {
    this._mockState = {
      audits: new Map()
    };
  }

  async createAuditLog(readinessId, eventType, actorId, detailsJson = {}) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const auditEventId = 'aud_145_' + crypto.randomBytes(8).toString('hex');
    const created = new Date();

    if (!isProdLike) {
      if (!this._mockState.audits.has(readinessId)) {
        this._mockState.audits.set(readinessId, []);
      }
      this._mockState.audits.get(readinessId).push({
        audit_event_id: auditEventId,
        readiness_id: readinessId,
        event_type: eventType,
        actor_id: actorId,
        details_json: detailsJson,
        created_at: created
      });
      return { auditEventId };
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_exec_ready_audits
       (audit_event_id, readiness_id, event_type, actor_id, details_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [auditEventId, readinessId, eventType, actorId, JSON.stringify(detailsJson), created]
    );
    return { auditEventId };
  }

  async getAuditLogs(readinessId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return this._mockState.audits.get(readinessId) || [];
    }

    return await db.query(
      `SELECT * FROM cb_cohort_intervention_exec_ready_audits
       WHERE readiness_id = ?
       ORDER BY created_at ASC`,
      [readinessId]
    );
  }
}

const serviceInstance = new CohortInterventionExecutionReadinessAuditService();
module.exports = {
  CohortInterventionExecutionReadinessAuditService,
  serviceInstance
};
