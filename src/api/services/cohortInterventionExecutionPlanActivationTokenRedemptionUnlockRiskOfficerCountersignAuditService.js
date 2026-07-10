'use strict';

const db = require('./mysqlClient');
const crypto = require('crypto');

const isProdLike = process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersignAuditService {
  constructor() {
    this._mockAudit = new Map();
  }

  async logAction(unlockRiskOfficerCountersignId, actionType, actorId, details = {}) {
    const auditId = 'aud_roc_' + crypto.randomBytes(8).toString('hex');
    const detailsJson = JSON.stringify(details);

    if (!isProdLike) {
      this._mockAudit.set(auditId, {
        audit_id: auditId,
        act_token_redempt_unlock_risk_officer_countersign_id: unlockRiskOfficerCountersignId,
        action_type: actionType,
        actor_id: actorId,
        details_json: detailsJson,
        created_at: new Date()
      });
      console.log(`[UNLOCK RISK OFFICER COUNTERSIGN AUDIT MOCK] ID: ${unlockRiskOfficerCountersignId}, Action: ${actionType}, Actor: ${actorId}`);
    } else {
      await db.query(
        `INSERT INTO cb_cohort_intervention_activation_token_redempt_unlock_roc_aud
         (audit_id, act_token_redempt_unlock_risk_officer_countersign_id, action_type, actor_id, details_json)
         VALUES (?, ?, ?, ?, ?)`,
        [auditId, unlockRiskOfficerCountersignId, actionType, actorId, detailsJson]
      );
    }
    return auditId;
  }

  async getAuditLogs(unlockRiskOfficerCountersignId) {
    if (!isProdLike) {
      return Array.from(this._mockAudit.values()).filter(
        a => a.act_token_redempt_unlock_risk_officer_countersign_id === unlockRiskOfficerCountersignId
      );
    }
    return await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_roc_aud
       WHERE act_token_redempt_unlock_risk_officer_countersign_id = ?
       ORDER BY created_at ASC`,
      [unlockRiskOfficerCountersignId]
    );
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersignAuditService()
};
