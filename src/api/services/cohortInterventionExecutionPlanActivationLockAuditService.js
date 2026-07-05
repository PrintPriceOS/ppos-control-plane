'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');

class CohortInterventionExecutionPlanActivationLockAuditService {
  constructor() {
    this._mockState = {
      audits: new Map()
    };
  }

  async createAuditLog(activationLockId, eventType, actorId, detailsJson = {}) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const auditEventId = 'aud_152_' + crypto.randomBytes(8).toString('hex');
    const created = new Date();

    if (!isProdLike) {
      if (!this._mockState.audits.has(activationLockId)) {
        this._mockState.audits.set(activationLockId, []);
      }
      this._mockState.audits.get(activationLockId).push({
        audit_event_id: auditEventId,
        activation_lock_id: activationLockId,
        event_type: eventType,
        actor_id: actorId,
        details_json: detailsJson,
        created_at: created
      });
      return { auditEventId };
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_lock_audits
       (audit_event_id, activation_lock_id, event_type, actor_id, details_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [auditEventId, activationLockId, eventType, actorId, JSON.stringify(detailsJson), created]
    );
    return { auditEventId };
  }

  async getAuditLogs(activationLockId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return this._mockState.audits.get(activationLockId) || [];
    }

    return await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_lock_audits
       WHERE activation_lock_id = ?
       ORDER BY created_at ASC`,
      [activationLockId]
    );
  }
}

const serviceInstance = new CohortInterventionExecutionPlanActivationLockAuditService();
module.exports = {
  CohortInterventionExecutionPlanActivationLockAuditService,
  serviceInstance
};
