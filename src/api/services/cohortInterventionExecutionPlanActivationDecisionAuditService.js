'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');

class CohortInterventionExecutionPlanActivationDecisionAuditService {
  constructor() {
    this._mockState = {
      audits: new Map()
    };
  }

  async createAuditLog(activationDecisionId, eventType, actorId, detailsJson = {}) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const auditEventId = 'aud_153_' + crypto.randomBytes(8).toString('hex');
    const created = new Date();

    if (!isProdLike) {
      if (!this._mockState.audits.has(activationDecisionId)) {
        this._mockState.audits.set(activationDecisionId, []);
      }
      this._mockState.audits.get(activationDecisionId).push({
        audit_event_id: auditEventId,
        activation_decision_id: activationDecisionId,
        event_type: eventType,
        actor_id: actorId,
        details_json: detailsJson,
        created_at: created
      });
      return { auditEventId };
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_decision_audits
       (audit_event_id, activation_decision_id, event_type, actor_id, details_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [auditEventId, activationDecisionId, eventType, actorId, JSON.stringify(detailsJson), created]
    );
    return { auditEventId };
  }

  async getAuditLogs(activationDecisionId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return this._mockState.audits.get(activationDecisionId) || [];
    }

    return await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_decision_audits
       WHERE activation_decision_id = ?
       ORDER BY created_at ASC`,
      [activationDecisionId]
    );
  }
}

const serviceInstance = new CohortInterventionExecutionPlanActivationDecisionAuditService();
module.exports = {
  CohortInterventionExecutionPlanActivationDecisionAuditService,
  serviceInstance
};
