'use strict';

const db = require('./mysqlClient');

const isProdLike = process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosureAuditService {
  constructor() {
    this._mockLogs = [];
  }

  async logAction(unlockGovernanceReadinessClosureId, action, actor, details = '') {
    const record = {
      act_token_redempt_unlock_governance_readiness_closure_id: unlockGovernanceReadinessClosureId,
      action,
      actor,
      details,
      created_at: new Date()
    };

    if (!isProdLike) {
      this._mockLogs.push(record);
      console.log(`[UNLOCK GOVERNANCE READINESS CLOSURE AUDIT MOCK] ID: ${unlockGovernanceReadinessClosureId}, Action: ${action}, Actor: ${actor}`);
    } else {
      await db.query(
        `INSERT INTO cb_cohort_intervention_activation_token_redempt_unlock_grc_aud
         (act_token_redempt_unlock_governance_readiness_closure_id, action, actor, details)
         VALUES (?, ?, ?, ?)`,
        [unlockGovernanceReadinessClosureId, action, actor, typeof details === 'string' ? details : JSON.stringify(details)]
      );
    }
    return record;
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosureAuditService()
};
