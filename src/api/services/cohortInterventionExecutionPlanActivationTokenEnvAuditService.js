'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');

class CohortInterventionExecutionPlanActivationTokenEnvAuditService {
  constructor() {
    this._mockState = {
      audits: new Map()
    };
  }

  async createAuditLog(activationTokenEnvId, eventType, actorId, detailsJson = {}) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const auditEventId = 'aud_156_' + crypto.randomBytes(8).toString('hex');
    const created = new Date();

    if (!isProdLike) {
      if (!this._mockState.audits.has(activationTokenEnvId)) {
        this._mockState.audits.set(activationTokenEnvId, []);
      }
      this._mockState.audits.get(activationTokenEnvId).push({
        audit_event_id: auditEventId,
        activation_token_env_id: activationTokenEnvId,
        event_type: eventType,
        actor_id: actorId,
        details_json: detailsJson,
        created_at: created
      });
      return { auditEventId };
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_env_audits
       (audit_event_id, activation_token_env_id, event_type, actor_id, details_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [auditEventId, activationTokenEnvId, eventType, actorId, JSON.stringify(detailsJson), created]
    );
    return { auditEventId };
  }

  async getAuditLogs(activationTokenEnvId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return this._mockState.audits.get(activationTokenEnvId) || [];
    }

    return await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_token_env_audits
       WHERE activation_token_env_id = ?
       ORDER BY created_at ASC`,
      [activationTokenEnvId]
    );
  }
}

const serviceInstance = new CohortInterventionExecutionPlanActivationTokenEnvAuditService();
module.exports = {
  CohortInterventionExecutionPlanActivationTokenEnvAuditService,
  serviceInstance
};
