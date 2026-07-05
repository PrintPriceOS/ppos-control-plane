'use strict';

const db = require('./mysqlClient');
const crypto = require('crypto');

class CohortInterventionExecutionPlanActivationTokenStagingAuditService {
  async createAuditLog(activationTokenStagingId, action, actorId, payload = {}) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const auditId = 'aud_158_' + crypto.randomBytes(8).toString('hex');

    if (!isProdLike) {
      console.log(`[STAGING AUDIT MOCK] ID: ${activationTokenStagingId}, Action: ${action}, Actor: ${actorId}`);
      return { auditId, activationTokenStagingId, action, actorId, payload_json: payload };
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_staging_audits 
       (audit_id, activation_token_staging_id, action, actor_id, payload_json) 
       VALUES (?, ?, ?, ?, ?)`,
      [auditId, activationTokenStagingId, action, actorId, JSON.stringify(payload)]
    );

    return { auditId };
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenStagingAuditService()
};
