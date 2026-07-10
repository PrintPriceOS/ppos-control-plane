'use strict';

const db = require('./mysqlClient');
const crypto = require('crypto');
const builderService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthorityBuilderService').serviceInstance;
const auditService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthorityAuditService').serviceInstance;

const isProdLike = process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthorityEvaluatorService {
  constructor() {
    this._mockState = {
      rules: new Map()
    };
  }

  async evaluateUnlockEmergencyRollbackAuthority(unlockEmergencyRollbackAuthorityId, confirmations = {}, actorId) {
    const record = await builderService.getTokenRedemptionUnlockEmergencyRollbackAuthority(unlockEmergencyRollbackAuthorityId);
    if (!record) {
      throw new Error(`Record ${unlockEmergencyRollbackAuthorityId} not found.`);
    }

    if (record.unlock_emergency_rollback_authority_status !== 'DRAFT') {
      throw new Error(`Record must be in DRAFT status to evaluate. Current status: ${record.unlock_emergency_rollback_authority_status}`);
    }

    if (!record.rollback_officer_id) {
      throw new Error('ROLLBACK_OFFICER_MISSING');
    }

    // Role checks
    const allowedRoles = ['rollback_officer', 'emergency_stop_authority', 'operations_director', 'site_reliability_leader', 'chief_safety_officer'];
    if (!allowedRoles.includes(record.rollback_officer_role)) {
      throw new Error('ROLLBACK_OFFICER_ROLE_INVALID');
    }

    if (!record.rollback_officer_confirmed_at) {
      throw new Error('ROLLBACK_OFFICER_TIMESTAMP_MISSING');
    }

    // Independence separation of duty checks
    const priorIds = [
      record.primary_authorizer_id,
      record.secondary_authorizer_id,
      record.final_human_authorizer_id,
      record.compliance_witness_id,
      record.risk_officer_id,
      record.legal_policy_officer_id
    ];

    if (priorIds.includes(record.rollback_officer_id)) {
      throw new Error('ROLLBACK_OFFICER_DUPLICATES_PRIOR_AUTHORIZER_FORBIDDEN');
    }

    const checklist = [
      'emergency_rollback_authority_confirmation',
      'rollback_officer_assigned_confirmed',
      'emergency_stop_authority_ready_confirmed',
      'rollback_channel_available_confirmed',
      'rollback_runbook_available_confirmed',
      'kill_switch_verified',
      'non_execution_confirmed',
      'legal_policy_hold_clearance_verified',
      'risk_officer_countersign_verified',
      'compliance_witness_attestation_verified',
      'final_human_seal_authorizer_unlock_seal_verified',
      'primary_authorizer_unlock_authorization_verified',
      'secondary_authorizer_unlock_authorization_verified',
      'seal_authenticity_confirmed',
      'pre_execution_state_sealed_confirmed'
    ];

    const ruleResults = [];
    let allRulesPassed = true;

    for (const checkName of checklist) {
      const isConfirmed = !!confirmations[checkName];
      const severity = [
        'emergency_rollback_authority_confirmation',
        'rollback_officer_assigned_confirmed',
        'emergency_stop_authority_ready_confirmed',
        'rollback_channel_available_confirmed',
        'rollback_runbook_available_confirmed'
      ].includes(checkName) ? 'CRITICAL' : 'WARNING';

      const rulePassed = isConfirmed;
      if (!rulePassed && severity === 'CRITICAL') {
        allRulesPassed = false;
      }

      ruleResults.push({
        rule_log_id: 'rl_' + crypto.randomBytes(8).toString('hex'),
        act_token_redempt_unlock_emergency_rollback_authority_id: unlockEmergencyRollbackAuthorityId,
        rule_id: 'rul_' + crypto.randomBytes(8).toString('hex'),
        check_type: checkName.toUpperCase() + '_CHECK',
        severity,
        description: `Check if ${checkName} is explicitly confirmed.`,
        evaluation_status: rulePassed ? 'PASSED' : 'FAILED',
        evaluated_at: new Date(),
        created_by: actorId,
        updated_by: actorId
      });
    }

    // Persist rule evaluations
    if (!isProdLike) {
      this._mockState.rules.set(unlockEmergencyRollbackAuthorityId, ruleResults);
      builderService._mockState.rules.set(unlockEmergencyRollbackAuthorityId, ruleResults);
    } else {
      await db.query(
        `DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_era_rl
         WHERE act_token_redempt_unlock_emergency_rollback_authority_id = ?`,
        [unlockEmergencyRollbackAuthorityId]
      );
      for (const rl of ruleResults) {
        await db.query(
          `INSERT INTO cb_cohort_intervention_activation_token_redempt_unlock_era_rl
           (rule_log_id, act_token_redempt_unlock_emergency_rollback_authority_id, rule_id, check_type, severity, description, evaluation_status, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [rl.rule_log_id, rl.act_token_redempt_unlock_emergency_rollback_authority_id, rl.rule_id, rl.check_type, rl.severity, rl.description, rl.evaluation_status, rl.created_by, rl.updated_by]
        );
      }
    }

    const updateFields = {
      unlock_emergency_rollback_authority_status: 'EVALUATED',
      unlock_emergency_rollback_authority_result: allRulesPassed ? 'EMERGENCY_ROLLBACK_AUTHORITY_CONFIRMED_NOT_UNLOCKED' : 'EMERGENCY_ROLLBACK_AUTHORITY_FAILED',
      unlock_emergency_rollback_authority_rules_json: ruleResults,
      rollback_readiness_snapshot_json: confirmations
    };

    await builderService._internalUpdateUnlockEmergencyRollbackAuthority(unlockEmergencyRollbackAuthorityId, updateFields);
    await auditService.logAction(unlockEmergencyRollbackAuthorityId, 'UNLOCK_EMERGENCY_ROLLBACK_AUTHORITY_EVALUATED', actorId, { allRulesPassed });

    return { allRulesPassed, ruleResults };
  }

  async getRuleLogs(unlockEmergencyRollbackAuthorityId) {
    if (!isProdLike) {
      return this._mockState.rules.get(unlockEmergencyRollbackAuthorityId) || [];
    }
    return await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_era_rl
       WHERE act_token_redempt_unlock_emergency_rollback_authority_id = ?`,
      [unlockEmergencyRollbackAuthorityId]
    );
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthorityEvaluatorService()
};
