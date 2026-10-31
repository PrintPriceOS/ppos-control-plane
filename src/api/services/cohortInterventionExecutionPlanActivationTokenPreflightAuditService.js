'use strict';

const db = require('./mysqlClient');
const crypto = require('crypto');

class CohortInterventionExecutionPlanActivationTokenPreflightAuditService {
  async createAuditLog(activationTokenPreflightId, action, actorId, payload = {}) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const auditId = 'aud_159_' + crypto.randomBytes(8).toString('hex');

    if (!isProdLike) {
      console.log(`[PREFLIGHT AUDIT MOCK] ID: ${activationTokenPreflightId}, Action: ${action}, Actor: ${actorId}`);
      return { auditId, activationTokenPreflightId, action, actorId, payload_json: payload };
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_preflight_audits 
       (audit_id, activation_token_preflight_id, action, actor_id, metadata_json) 
       VALUES (?, ?, ?, ?, ?)`,
      [auditId, activationTokenPreflightId, action, actorId, JSON.stringify(payload)]
    );

    return { auditId };
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenPreflightAuditService()
};
