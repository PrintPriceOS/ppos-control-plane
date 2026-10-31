'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');

class CohortInterventionSimulationAuditService {
  async recordAuditEvent(simulationId, eventType, actorId = 'system', details = null) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const auditEventId = 'sae_' + crypto.randomBytes(8).toString('hex');

    if (isProdLike) {
      await db.query(
        `INSERT INTO controlled_beta_cohort_intervention_sim_audit_events
         (audit_event_id, simulation_id, event_type, actor_id, details_json)
         VALUES (?, ?, ?, ?, ?)`,
        [auditEventId, simulationId, eventType, actorId, details ? JSON.stringify(details) : null]
      );
    }

    return { audit_event_id: auditEventId };
  }
}

const serviceInstance = new CohortInterventionSimulationAuditService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
module.exports.CohortInterventionSimulationAuditService = CohortInterventionSimulationAuditService;
