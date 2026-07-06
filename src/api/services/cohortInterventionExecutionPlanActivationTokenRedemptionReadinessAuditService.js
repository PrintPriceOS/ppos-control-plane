'use strict';

const db = require('./mysqlClient');
const crypto = require('crypto');

class CohortInterventionExecutionPlanActivationTokenRedemptionReadinessAuditService {
  async createAuditLog(activationTokenRedemptionReadinessId, action, actorId, payload = {}) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const auditId = 'aud_161_' + crypto.randomBytes(8).toString('hex');

    if (!isProdLike) {
      console.log(`[REDEMPTION READINESS AUDIT MOCK] ID: ${activationTokenRedemptionReadinessId}, Action: ${action}, Actor: ${actorId}`);
      return { auditId, activationTokenRedemptionReadinessId, action, actorId, payload_json: payload };
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_redemption_readiness_audits 
       (audit_id, activation_token_redemption_readiness_id, action, actor_id, metadata_json) 
       VALUES (?, ?, ?, ?, ?)`,
      [auditId, activationTokenRedemptionReadinessId, action, actorId, JSON.stringify(payload)]
    );

    return { auditId };
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionReadinessAuditService()
};
