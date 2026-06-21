'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');

class CohortInterventionExecutionAuditService {
  constructor() {
    this._mockState = {
      audits: new Map()
    };
  }

  async recordAuditEvent(executionId, eventType, actorId, details = {}) {
    const auditEventId = 'eae_' + crypto.randomBytes(8).toString('hex');
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      const list = this._mockState.audits.get(executionId) || [];
      list.push({
        audit_event_id: auditEventId,
        execution_id: executionId,
        event_type: eventType,
        actor_id: actorId,
        details_json: details,
        created_at: new Date()
      });
      this._mockState.audits.set(executionId, list);
    } else {
      await db.query(
        "INSERT INTO controlled_beta_cohort_intervention_execution_audit_events (audit_event_id, execution_id, event_type, actor_id, details_json) VALUES (?, ?, ?, ?, ?)",
        [auditEventId, executionId, eventType, actorId, JSON.stringify(details)]
      );
    }
    return auditEventId;
  }
}

const serviceInstance = new CohortInterventionExecutionAuditService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
