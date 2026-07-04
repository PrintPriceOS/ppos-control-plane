'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');

class CohortInterventionExecutionPlanActivationReadinessAuditService {
  constructor() {
    this._mockState = {
      audits: new Map()
    };
  }

  async createAuditLog(activationRdId, eventType, actorId, detailsJson = {}) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const auditEventId = 'aud_150_' + crypto.randomBytes(8).toString('hex');
    const created = new Date();

    if (!isProdLike) {
      if (!this._mockState.audits.has(activationRdId)) {
        this._mockState.audits.set(activationRdId, []);
      }
      this._mockState.audits.get(activationRdId).push({
        audit_event_id: auditEventId,
        activation_rd_id: activationRdId,
        event_type: eventType,
        actor_id: actorId,
        details_json: detailsJson,
        created_at: created
      });
      return { auditEventId };
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_rd_audits
       (audit_event_id, activation_rd_id, event_type, actor_id, details_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [auditEventId, activationRdId, eventType, actorId, JSON.stringify(detailsJson), created]
    );
    return { auditEventId };
  }

  async getAuditLogs(activationRdId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return this._mockState.audits.get(activationRdId) || [];
    }

    return await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_rd_audits
       WHERE activation_rd_id = ?
       ORDER BY created_at ASC`,
      [activationRdId]
    );
  }
}

const serviceInstance = new CohortInterventionExecutionPlanActivationReadinessAuditService();
module.exports = {
  CohortInterventionExecutionPlanActivationReadinessAuditService,
  serviceInstance
};
