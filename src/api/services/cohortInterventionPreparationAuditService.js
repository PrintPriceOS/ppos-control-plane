'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');

class CohortInterventionPreparationAuditService {
  constructor() {
    this._mockState = {
      audits: new Map()
    };
  }

  async recordAuditEvent(preparationId, eventType, actorId, details = {}) {
    const auditEventId = 'pae_' + crypto.randomBytes(8).toString('hex');
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      const list = this._mockState.audits.get(preparationId) || [];
      list.push({
        audit_event_id: auditEventId,
        preparation_id: preparationId,
        event_type: eventType,
        actor_id: actorId,
        details_json: details,
        created_at: new Date()
      });
      this._mockState.audits.set(preparationId, list);
    } else {
      await db.query(
        "INSERT INTO controlled_beta_cohort_intervention_preparation_audit_events (audit_event_id, preparation_id, event_type, actor_id, details_json) VALUES (?, ?, ?, ?, ?)",
        [auditEventId, preparationId, eventType, actorId, JSON.stringify(details)]
      );
    }
    return auditEventId;
  }
}

const serviceInstance = new CohortInterventionPreparationAuditService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
