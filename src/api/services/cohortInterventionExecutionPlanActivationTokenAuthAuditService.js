'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');

class CohortInterventionExecutionPlanActivationTokenAuthAuditService {
  constructor() {
    this._mockState = {
      audits: new Map()
    };
  }

  async createAuditLog(activationTokenAuthId, eventType, actorId, detailsJson = {}) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const auditEventId = 'aud_155_' + crypto.randomBytes(8).toString('hex');
    const created = new Date();

    if (!isProdLike) {
      if (!this._mockState.audits.has(activationTokenAuthId)) {
        this._mockState.audits.set(activationTokenAuthId, []);
      }
      this._mockState.audits.get(activationTokenAuthId).push({
        audit_event_id: auditEventId,
        activation_token_auth_id: activationTokenAuthId,
        event_type: eventType,
        actor_id: actorId,
        details_json: detailsJson,
        created_at: created
      });
      return { auditEventId };
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_auth_audits
       (audit_event_id, activation_token_auth_id, event_type, actor_id, details_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [auditEventId, activationTokenAuthId, eventType, actorId, JSON.stringify(detailsJson), created]
    );
    return { auditEventId };
  }

  async getAuditLogs(activationTokenAuthId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return this._mockState.audits.get(activationTokenAuthId) || [];
    }

    return await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_token_auth_audits
       WHERE activation_token_auth_id = ?
       ORDER BY created_at ASC`,
      [activationTokenAuthId]
    );
  }
}

const serviceInstance = new CohortInterventionExecutionPlanActivationTokenAuthAuditService();
module.exports = {
  CohortInterventionExecutionPlanActivationTokenAuthAuditService,
  serviceInstance
};
