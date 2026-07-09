'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSealAuditService {
  constructor() {
    this._mockAudits = [];
  }

  async logAction(unlockFinalHumanAuthorizationSealId, actionType, actorId, details = {}) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      this._mockAudits.push({
        audit_id: `aud_${crypto.randomBytes(8).toString('hex')}`,
        act_token_redempt_unlock_final_human_authorization_seal_id: unlockFinalHumanAuthorizationSealId,
        action_type: actionType,
        actor_id: actorId,
        details_json: JSON.stringify(details),
        created_at: new Date()
      });
      console.log(`[UNLOCK FINAL HUMAN SEAL AUDIT MOCK] ID: ${unlockFinalHumanAuthorizationSealId}, Action: ${actionType}, Actor: ${actorId}`);
      return;
    }

    const auditId = `aud_${crypto.randomBytes(8).toString('hex')}`;
    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_redempt_unlock_fhas_aud
       (audit_id, act_token_redempt_unlock_final_human_authorization_seal_id, action_type, actor_id, details_json)
       VALUES (?, ?, ?, ?, ?)`,
      [auditId, unlockFinalHumanAuthorizationSealId, actionType, actorId, JSON.stringify(details)]
    );
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSealAuditService()
};
