'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');

class CohortInterventionExecutionPlanActivationAuthorizationAuditService {
  constructor() {
    this._mockState = {
      audits: new Map()
    };
  }

  async createAuditLog(activationAuthId, eventType, actorId, detailsJson = {}) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const auditEventId = 'aud_151_' + crypto.randomBytes(8).toString('hex');
    const created = new Date();

    if (!isProdLike) {
      if (!this._mockState.audits.has(activationAuthId)) {
        this._mockState.audits.set(activationAuthId, []);
      }
      this._mockState.audits.get(activationAuthId).push({
        audit_event_id: auditEventId,
        activation_auth_id: activationAuthId,
        event_type: eventType,
        actor_id: actorId,
        details_json: detailsJson,
        created_at: created
      });
      return { auditEventId };
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_auth_audits
       (audit_event_id, activation_auth_id, event_type, actor_id, details_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [auditEventId, activationAuthId, eventType, actorId, JSON.stringify(detailsJson), created]
    );
    return { auditEventId };
  }

  async getAuditLogs(activationAuthId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return this._mockState.audits.get(activationAuthId) || [];
    }

    return await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_auth_audits
       WHERE activation_auth_id = ?
       ORDER BY created_at ASC`,
      [activationAuthId]
    );
  }
}

const serviceInstance = new CohortInterventionExecutionPlanActivationAuthorizationAuditService();
module.exports = {
  CohortInterventionExecutionPlanActivationAuthorizationAuditService,
  serviceInstance
};
