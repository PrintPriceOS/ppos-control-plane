'use strict';

const db = require('./mysqlClient');

const isProdLike = process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockKillSwitchDryRunAuditService {
  constructor() {
    this._mockLogs = [];
  }

  async logAction(unlockKillSwitchDryRunId, action, actor, details = '') {
    const record = {
      act_token_redempt_unlock_kill_switch_dry_run_id: unlockKillSwitchDryRunId,
      action,
      actor,
      details,
      created_at: new Date()
    };

    if (!isProdLike) {
      this._mockLogs.push(record);
      console.log(`[UNLOCK KILL-SWITCH DRY-RUN AUDIT MOCK] ID: ${unlockKillSwitchDryRunId}, Action: ${action}, Actor: ${actor}`);
    } else {
      await db.query(
        `INSERT INTO cb_cohort_intervention_activation_token_redempt_unlock_ksdr_aud
         (act_token_redempt_unlock_kill_switch_dry_run_id, action, actor, details)
         VALUES (?, ?, ?, ?)`,
        [unlockKillSwitchDryRunId, action, actor, typeof details === 'string' ? details : JSON.stringify(details)]
      );
    }
    return record;
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockKillSwitchDryRunAuditService()
};
