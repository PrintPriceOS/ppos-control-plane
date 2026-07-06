'use strict';

const db = require('./mysqlClient');
const crypto = require('crypto');

class CohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationAuditService {
  async createAuditLog(activationTokenRedemptionAuthId, action, actorId, payload = {}) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const auditId = 'aud_162_' + crypto.randomBytes(8).toString('hex');

    if (!isProdLike) {
      console.log(`[REDEMPTION AUTH AUDIT MOCK] ID: ${activationTokenRedemptionAuthId}, Action: ${action}, Actor: ${actorId}`);
      return { auditId, activationTokenRedemptionAuthId, action, actorId, payload_json: payload };
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_redempt_auth_audits 
       (audit_id, activation_token_redemption_auth_id, action, actor_id, metadata_json) 
       VALUES (?, ?, ?, ?, ?)`,
      [auditId, activationTokenRedemptionAuthId, action, actorId, JSON.stringify(payload)]
    );

    return { auditId };
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationAuditService()
};
