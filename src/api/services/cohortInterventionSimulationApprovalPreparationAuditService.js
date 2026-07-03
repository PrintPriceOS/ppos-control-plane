'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');

class CohortInterventionSimulationApprovalPreparationAuditService {
  constructor() {
    this._mockState = {
      auditEvents: new Map()
    };
  }

  async recordAuditEvent(prepId, eventType, actorId, details = {}) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const auditEventId = 'pra_' + crypto.randomBytes(8).toString('hex');
    const created = new Date();

    const auditEvent = {
      audit_event_id: auditEventId,
      prep_id: prepId,
      event_type: eventType,
      actor_id: actorId,
      details_json: details,
      created_at: created
    };

    if (!isProdLike) {
      if (!this._mockState.auditEvents.has(prepId)) {
        this._mockState.auditEvents.set(prepId, []);
      }
      this._mockState.auditEvents.get(prepId).push(auditEvent);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_cohort_intervention_app_prep_audit_events
         (audit_event_id, prep_id, event_type, actor_id, details_json)
         VALUES (?, ?, ?, ?, ?)`,
        [auditEventId, prepId, eventType, actorId, JSON.stringify(details)]
      );
    }
    return auditEvent;
  }

  async getAuditEvents(prepId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      return this._mockState.auditEvents.get(prepId) || [];
    } else {
      return await db.query(
        `SELECT * FROM controlled_beta_cohort_intervention_app_prep_audit_events
         WHERE prep_id = ? ORDER BY created_at ASC`,
        [prepId]
      );
    }
  }
}

const serviceInstance = new CohortInterventionSimulationApprovalPreparationAuditService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
module.exports.CohortInterventionSimulationApprovalPreparationAuditService = CohortInterventionSimulationApprovalPreparationAuditService;
