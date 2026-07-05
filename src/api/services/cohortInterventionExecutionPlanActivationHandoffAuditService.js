'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');

class CohortInterventionExecutionPlanActivationHandoffAuditService {
  constructor() {
    this._mockState = {
      audits: new Map()
    };
  }

  async createAuditLog(activationHandoffId, eventType, actorId, detailsJson = {}) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const auditEventId = 'aud_154_' + crypto.randomBytes(8).toString('hex');
    const created = new Date();

    if (!isProdLike) {
      if (!this._mockState.audits.has(activationHandoffId)) {
        this._mockState.audits.set(activationHandoffId, []);
      }
      this._mockState.audits.get(activationHandoffId).push({
        audit_event_id: auditEventId,
        activation_handoff_id: activationHandoffId,
        event_type: eventType,
        actor_id: actorId,
        details_json: detailsJson,
        created_at: created
      });
      return { auditEventId };
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_handoff_audits
       (audit_event_id, activation_handoff_id, event_type, actor_id, details_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [auditEventId, activationHandoffId, eventType, actorId, JSON.stringify(detailsJson), created]
    );
    return { auditEventId };
  }

  async getAuditLogs(activationHandoffId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return this._mockState.audits.get(activationHandoffId) || [];
    }

    return await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_handoff_audits
       WHERE activation_handoff_id = ?
       ORDER BY created_at ASC`,
      [activationHandoffId]
    );
  }
}

const serviceInstance = new CohortInterventionExecutionPlanActivationHandoffAuditService();
module.exports = {
  CohortInterventionExecutionPlanActivationHandoffAuditService,
  serviceInstance
};
