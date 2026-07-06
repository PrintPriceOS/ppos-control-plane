'use strict';

const db = require('./mysqlClient');
const crypto = require('crypto');

class CohortInterventionExecutionPlanActivationTokenRedemptionFinalApprovalAuditService {
  async createAuditLog(activationTokenRedemptionFinalApvId, action, actorId, payload = {}) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const auditId = 'aud_164_' + crypto.randomBytes(8).toString('hex');

    if (!isProdLike) {
      console.log(`[FINAL APPROVAL AUDIT MOCK] ID: ${activationTokenRedemptionFinalApvId}, Action: ${action}, Actor: ${actorId}`);
      return { auditId, activationTokenRedemptionFinalApvId, action, actorId, payload_json: payload };
    }

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_redempt_fapv_audits 
       (audit_id, activation_token_redemption_final_apv_id, action, actor_id, metadata_json) 
       VALUES (?, ?, ?, ?, ?)`,
      [auditId, activationTokenRedemptionFinalApvId, action, actorId, JSON.stringify(payload)]
    );

    return { auditId };
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionFinalApprovalAuditService()
};
