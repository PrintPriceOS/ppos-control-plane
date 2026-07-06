'use strict';

const db = require('./mysqlClient');
const crypto = require('crypto');

class CohortInterventionExecutionPlanActivationTokenRedemptionEnvelopeAuditService {
  async createAuditLog(activationTokenRedemptionEnvelopeId, action, actorId, payload = {}) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const auditId = 'aud_163_' + crypto.randomBytes(8).toString('hex');

    if (!isProdLike) {
      console.log(`[REDEMPTION ENVELOPE AUDIT MOCK] ID: ${activationTokenRedemptionEnvelopeId}, Action: ${action}, Actor: ${actorId}`);
      return { auditId, activationTokenRedemptionEnvelopeId, action, actorId, payload_json: payload };
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_redempt_env_audits 
       (audit_id, activation_token_redemption_envelope_id, action, actor_id, metadata_json) 
       VALUES (?, ?, ?, ?, ?)`,
      [auditId, activationTokenRedemptionEnvelopeId, action, actorId, JSON.stringify(payload)]
    );

    return { auditId };
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionEnvelopeAuditService()
};
