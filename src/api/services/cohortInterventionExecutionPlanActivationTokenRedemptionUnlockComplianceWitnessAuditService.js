'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockComplianceWitnessAuditService {
  constructor() {
    this._mockAudits = [];
  }

  async logAction(unlockComplianceWitnessId, actionType, actorId, details = {}) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
       this._mockAudits.push({
         audit_id: `aud_${crypto.randomBytes(8).toString('hex')}`,
         act_token_redempt_unlock_compliance_witness_id: unlockComplianceWitnessId,
         action_type: actionType,
         actor_id: actorId,
         details_json: JSON.stringify(details),
         created_at: new Date()
       });
       console.log(`[UNLOCK COMPLIANCE WITNESS AUDIT MOCK] ID: ${unlockComplianceWitnessId}, Action: ${actionType}, Actor: ${actorId}`);
       return;
    }

    const auditId = `aud_${crypto.randomBytes(8).toString('hex')}`;
    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_redempt_unlock_cwn_aud
       (audit_id, act_token_redempt_unlock_compliance_witness_id, action_type, actor_id, details_json)
       VALUES (?, ?, ?, ?, ?)`,
      [auditId, unlockComplianceWitnessId, actionType, actorId, JSON.stringify(details)]
    );
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockComplianceWitnessAuditService()
};
