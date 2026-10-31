'use strict';

const db = require('./mysqlClient');
const crypto = require('crypto');

const isProdLike = process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthorityAuditService {
  constructor() {
    this._mockLogs = [];
  }

  async logAction(unlockEmergencyRollbackAuthorityId, action, actorId, metadata = {}) {
    const auditId = 'era_aud_' + crypto.randomBytes(8).toString('hex');
    const record = {
      audit_id: auditId,
      act_token_redempt_unlock_emergency_rollback_authority_id: unlockEmergencyRollbackAuthorityId,
      action,
      actor_id: actorId,
      action_metadata_json: metadata,
      timestamp: new Date(),
      created_by: actorId,
      updated_by: actorId
    };

    if (!isProdLike) {
      this._mockLogs.push(record);
      console.log(`[UNLOCK EMERGENCY ROLLBACK AUTHORITY AUDIT MOCK] ID: ${unlockEmergencyRollbackAuthorityId}, Action: ${action}, Actor: ${actorId}`);
    } else {
      await db.query(
        `INSERT INTO cb_cohort_intervention_activation_token_redempt_unlock_era_aud
         (audit_id, act_token_redempt_unlock_emergency_rollback_authority_id, action, actor_id, action_metadata_json, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [auditId, unlockEmergencyRollbackAuthorityId, action, actorId, JSON.stringify(metadata), actorId, actorId]
      );
    }
    return record;
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthorityAuditService()
};
