'use strict';

const db = require('./mysqlClient');
const crypto = require('crypto');

const isProdLike = process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldAuditService {
  constructor() {
    this._mockLogs = [];
  }

  async logAction(unlockLegalPolicyHoldId, action, actorId, metadata = {}) {
    const auditId = 'lph_aud_' + crypto.randomBytes(8).toString('hex');
    const record = {
      audit_id: auditId,
      act_token_redempt_unlock_legal_policy_hold_id: unlockLegalPolicyHoldId,
      action,
      actor_id: actorId,
      action_metadata_json: metadata,
      timestamp: new Date(),
      created_by: actorId,
      updated_by: actorId
    };

    if (!isProdLike) {
      this._mockLogs.push(record);
      console.log(`[UNLOCK LEGAL POLICY HOLD AUDIT MOCK] ID: ${unlockLegalPolicyHoldId}, Action: ${action}, Actor: ${actorId}`);
    } else {
      await db.query(
        `INSERT INTO cb_cohort_intervention_activation_token_redempt_unlock_lph_aud
         (audit_id, act_token_redempt_unlock_legal_policy_hold_id, action, actor_id, action_metadata_json, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [auditId, unlockLegalPolicyHoldId, action, actorId, JSON.stringify(metadata), actorId, actorId]
      );
    }
    return record;
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldAuditService()
};
