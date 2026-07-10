'use strict';

const db = require('./mysqlClient');
const crypto = require('crypto');
const builderService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockKillSwitchDryRunBuilderService').serviceInstance;
const auditService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockKillSwitchDryRunAuditService').serviceInstance;

const isProdLike = process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockKillSwitchDryRunEvaluatorService {
  constructor() {
    this._mockState = {
      rules: new Map()
    };
  }

  async evaluateUnlockKillSwitchDryRun(unlockKillSwitchDryRunId, confirmations = {}, actorId) {
    const record = await builderService.getTokenRedemptionUnlockKillSwitchDryRun(unlockKillSwitchDryRunId);
    if (!record) {
      throw new Error(`Record ${unlockKillSwitchDryRunId} not found.`);
    }

    if (record.unlock_kill_switch_dry_run_status !== 'DRAFT') {
      throw new Error(`Record must be in DRAFT status to evaluate. Current status: ${record.unlock_kill_switch_dry_run_status}`);
    }

    if (!record.kill_switch_verification_officer_id) {
      throw new Error('KILL_SWITCH_VERIFICATION_OFFICER_MISSING');
    }

    const allowedRoles = ['rollback_officer', 'emergency_stop_authority', 'site_reliability_leader', 'chief_safety_officer', 'security_officer'];
    if (!allowedRoles.includes(record.kill_switch_verification_officer_role)) {
      throw new Error('KILL_SWITCH_VERIFICATION_OFFICER_ROLE_INVALID');
    }

    // Independence checks
    const priorIds = [
      record.primary_authorizer_id,
      record.secondary_authorizer_id,
      record.final_human_authorizer_id,
      record.compliance_witness_id,
      record.risk_officer_id,
      record.legal_policy_officer_id
    ];
    if (priorIds.includes(record.kill_switch_verification_officer_id)) {
      throw new Error('KILL_SWITCH_VERIFIER_DUPLICATES_PRIOR_AUTHORIZER_FORBIDDEN');
    }

    const checklist = [
      'kill_switch_dry_run_verification_confirmation',
      'kill_switch_route_available_confirmed',
      'kill_switch_dry_run_response_confirmed',
      'kill_switch_no_runtime_mutation_confirmed',
      'kill_switch_no_real_execution_confirmed',
      'rollback_officer_ready_confirmed',
      'emergency_stop_authority_ready_confirmed',
      'rollback_channel_available_confirmed',
      'rollback_runbook_available_confirmed',
      'non_execution_confirmed',
      'legal_policy_hold_clearance_verified',
      'risk_officer_countersign_verified',
      'compliance_witness_attestation_verified',
      'final_human_authorization_seal_verified',
      'seal_authenticity_confirmed',
      'pre_execution_state_sealed_confirmed'
    ];

    const criticalChecks = [
      'kill_switch_dry_run_verification_confirmation',
      'kill_switch_route_available_confirmed',
      'kill_switch_dry_run_response_confirmed',
      'kill_switch_no_runtime_mutation_confirmed',
      'kill_switch_no_real_execution_confirmed'
    ];

    const ruleResults = [];
    let allRulesPassed = true;

    for (const checkName of checklist) {
      const isConfirmed = !!confirmations[checkName];
      const severity = criticalChecks.includes(checkName) ? 'CRITICAL' : 'WARNING';
      const rulePassed = isConfirmed;

      if (!rulePassed && severity === 'CRITICAL') {
        allRulesPassed = false;
      }

      ruleResults.push({
        rule_log_id: 'rl_' + crypto.randomBytes(8).toString('hex'),
        act_token_redempt_unlock_kill_switch_dry_run_id: unlockKillSwitchDryRunId,
        rule_code: checkName.toUpperCase(),
        rule_description: `Verify that ${checkName} is confirmed.`,
        evaluation_status: rulePassed ? 'PASSED' : 'FAILED',
        evaluation_message: rulePassed ? 'Verification passed.' : `Missing required confirmation for ${checkName}.`,
        severity
      });
    }

    if (!isProdLike) {
      this._mockState.rules.set(unlockKillSwitchDryRunId, ruleResults);
      builderService._mockState.rules.set(unlockKillSwitchDryRunId, ruleResults);
    } else {
      await db.query(
        `DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_ksdr_rl
         WHERE act_token_redempt_unlock_kill_switch_dry_run_id = ?`,
        [unlockKillSwitchDryRunId]
      );
      for (const rl of ruleResults) {
        await db.query(
          `INSERT INTO cb_cohort_intervention_activation_token_redempt_unlock_ksdr_rl
           (rule_log_id, act_token_redempt_unlock_kill_switch_dry_run_id, rule_code, rule_description, evaluation_status, evaluation_message, severity)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [rl.rule_log_id, rl.act_token_redempt_unlock_kill_switch_dry_run_id, rl.rule_code, rl.rule_description, rl.evaluation_status, rl.evaluation_message, rl.severity]
        );
      }
    }

    const updateFields = {
      unlock_kill_switch_dry_run_status: 'EVALUATED',
      unlock_kill_switch_dry_run_result: allRulesPassed ? 'KILL_SWITCH_DRY_RUN_VERIFIED_NOT_UNLOCKED' : 'KILL_SWITCH_DRY_RUN_FAILED',
      kill_switch_dry_run_rules_json: ruleResults,
      kill_switch_dry_run_result_json: { allRulesPassed, evaluatedAt: new Date() }
    };

    await builderService._internalUpdateTokenRedemptionUnlockKillSwitchDryRun(unlockKillSwitchDryRunId, updateFields);
    await auditService.logAction(unlockKillSwitchDryRunId, 'UNLOCK_KILL_SWITCH_DRY_RUN_EVALUATED', actorId);

    return { allRulesPassed, ruleResults };
  }

  async getRuleLogs(unlockKillSwitchDryRunId) {
    if (!isProdLike) {
      return this._mockState.rules.get(unlockKillSwitchDryRunId) || [];
    }
    return await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_ksdr_rl
       WHERE act_token_redempt_unlock_kill_switch_dry_run_id = ?`,
      [unlockKillSwitchDryRunId]
    );
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockKillSwitchDryRunEvaluatorService()
};
