'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');

class CohortInterventionExecutionPlanActivationTokenRedemptionLockAuditService {
  constructor() {
    this._mockAudits = [];
  }

  async logAction(lockId, actionType, actorId, details = {}) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      this._mockAudits.push({
        audit_id: `aud_${crypto.randomBytes(8).toString('hex')}`,
        activation_token_redemption_lock_id: lockId,
        action_type: actionType,
        actor_id: actorId,
        details_json: JSON.stringify(details),
        created_at: new Date()
      });
      console.log(`[REDEMPTION LOCK AUDIT MOCK] ID: ${lockId}, Action: ${actionType}, Actor: ${actorId}`);
      return;
    }

    const auditId = `aud_${crypto.randomBytes(8).toString('hex')}`;
    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_redempt_lock_audits
       (audit_id, activation_token_redemption_lock_id, action_type, actor_id, details_json)
       VALUES (?, ?, ?, ?, ?)`,
      [auditId, lockId, actionType, actorId, JSON.stringify(details)]
    );
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionLockAuditService()
};
