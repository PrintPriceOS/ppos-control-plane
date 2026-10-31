'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');

class CohortInterventionExecutionEnvelopeAuditService {
  constructor() {
    this._mockState = {
      audits: new Map()
    };
  }

  async createAuditLog(envelopeId, eventType, actorId, detailsJson = {}) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const auditEventId = 'aud_147_' + crypto.randomBytes(8).toString('hex');
    const created = new Date();

    if (!isProdLike) {
      if (!this._mockState.audits.has(envelopeId)) {
        this._mockState.audits.set(envelopeId, []);
      }
      this._mockState.audits.get(envelopeId).push({
        audit_event_id: auditEventId,
        envelope_id: envelopeId,
        event_type: eventType,
        actor_id: actorId,
        details_json: detailsJson,
        created_at: created
      });
      return { auditEventId };
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_envelope_audits
       (audit_event_id, envelope_id, event_type, actor_id, details_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [auditEventId, envelopeId, eventType, actorId, JSON.stringify(detailsJson), created]
    );
    return { auditEventId };
  }

  async getAuditLogs(envelopeId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return this._mockState.audits.get(envelopeId) || [];
    }

    return await db.query(
      `SELECT * FROM cb_cohort_intervention_envelope_audits
       WHERE envelope_id = ?
       ORDER BY created_at ASC`,
      [envelopeId]
    );
  }
}

const serviceInstance = new CohortInterventionExecutionEnvelopeAuditService();
module.exports = {
  CohortInterventionExecutionEnvelopeAuditService,
  serviceInstance
};
