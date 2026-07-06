'use strict';

const db = require('./mysqlClient');
const crypto = require('crypto');

class CohortInterventionExecutionPlanActivationTokenIssuanceAuditService {
  async createAuditLog(activationTokenIssuanceId, action, actorId, payload = {}) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const auditId = 'aud_160_' + crypto.randomBytes(8).toString('hex');

    if (!isProdLike) {
      console.log(`[ISSUANCE AUDIT MOCK] ID: ${activationTokenIssuanceId}, Action: ${action}, Actor: ${actorId}`);
      return { auditId, activationTokenIssuanceId, action, actorId, payload_json: payload };
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_issuance_audits 
       (audit_id, activation_token_issuance_id, action, actor_id, metadata_json) 
       VALUES (?, ?, ?, ?, ?)`,
      [auditId, activationTokenIssuanceId, action, actorId, JSON.stringify(payload)]
    );

    return { auditId };
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenIssuanceAuditService()
};
