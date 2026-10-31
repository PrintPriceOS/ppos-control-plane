'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');

class CohortInterventionExecutionPlanActivationTokenFinalApvAuditService {
  constructor() {
    this._mockState = {
      audits: new Map()
    };
  }

  async createAuditLog(activationTokenFinalApvId, eventType, actorId, detailsJson = {}) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const auditEventId = 'aud_157_' + crypto.randomBytes(8).toString('hex');
    const created = new Date();

    if (!isProdLike) {
      if (!this._mockState.audits.has(activationTokenFinalApvId)) {
        this._mockState.audits.set(activationTokenFinalApvId, []);
      }
      this._mockState.audits.get(activationTokenFinalApvId).push({
        audit_event_id: auditEventId,
        activation_token_final_apv_id: activationTokenFinalApvId,
        event_type: eventType,
        actor_id: actorId,
        details_json: detailsJson,
        created_at: created
      });
      return { auditEventId };
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_final_apv_audits
       (audit_event_id, activation_token_final_apv_id, event_type, actor_id, details_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [auditEventId, activationTokenFinalApvId, eventType, actorId, JSON.stringify(detailsJson), created]
    );
    return { auditEventId };
  }

  async getAuditLogs(activationTokenFinalApvId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return this._mockState.audits.get(activationTokenFinalApvId) || [];
    }

    return await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_token_final_apv_audits
       WHERE activation_token_final_apv_id = ?
       ORDER BY created_at ASC`,
      [activationTokenFinalApvId]
    );
  }
}

const serviceInstance = new CohortInterventionExecutionPlanActivationTokenFinalApvAuditService();
module.exports = {
  CohortInterventionExecutionPlanActivationTokenFinalApvAuditService,
  serviceInstance
};
