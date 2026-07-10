'use strict';

const db = require('./mysqlClient');
const crypto = require('crypto');
const builderService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosureBuilderService').serviceInstance;
const auditService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosureAuditService').serviceInstance;

const isProdLike = process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosureEvaluatorService {
  constructor() {
    this._mockState = {
      rules: new Map()
    };
  }

  async evaluateUnlockGovernanceReadinessClosure(unlockGovernanceReadinessClosureId, confirmations = {}, actorId) {
    const record = await builderService.getTokenRedemptionUnlockGovernanceReadinessClosure(unlockGovernanceReadinessClosureId);
    if (!record) {
      throw new Error(`Record ${unlockGovernanceReadinessClosureId} not found.`);
    }

    if (record.unlock_governance_readiness_closure_status !== 'DRAFT') {
      throw new Error(`Record must be in DRAFT status to evaluate. Current status: ${record.unlock_governance_readiness_closure_status}`);
    }

    if (!record.governance_closure_officer_id) {
      throw new Error('GOVERNANCE_CLOSURE_OFFICER_MISSING');
    }

    const allowedRoles = ['governance_officer', 'compliance_officer', 'security_officer', 'chief_governance_officer', 'audit_officer'];
    if (!allowedRoles.includes(record.governance_closure_officer_role)) {
      throw new Error('GOVERNANCE_CLOSURE_OFFICER_ROLE_INVALID');
    }

    // Independence checks
    const priorIds = [
      record.primary_authorizer_id,
      record.secondary_authorizer_id,
      record.final_human_authorizer_id,
      record.compliance_witness_id,
      record.risk_officer_id,
      record.legal_policy_officer_id,
      record.rollback_officer_id,
      record.kill_switch_verification_officer_id,
      record.evidence_seal_officer_id
    ];
    if (priorIds.includes(record.governance_closure_officer_id)) {
      throw new Error('GOVERNANCE_CLOSURE_OFFICER_DUPLICATES_PRIOR_AUTHORIZER_FORBIDDEN');
    }

    const checklist = [
      'governance_readiness_closure_confirmation',
      'phase160_to_phase179_chain_complete_confirmed',
      'final_non_execution_evidence_seal_verified',
      'kill_switch_dry_run_verified',
      'emergency_rollback_authority_verified',
      'legal_policy_hold_clearance_verified',
      'risk_officer_countersign_verified',
      'compliance_witness_attestation_verified',
      'final_human_authorization_seal_verified',
      'dual_control_authorization_verified',
      'operator_attestation_verified',
      'pre_execution_freeze_verified',
      'readiness_seal_verified',
      'final_review_verified',
      'token_never_unlocked_confirmed',
      'token_never_redeemable_confirmed',
      'token_never_redeemed_confirmed',
      'zero_runtime_mutation_confirmed'
    ];

    const criticalChecks = [
      'governance_readiness_closure_confirmation',
      'phase160_to_phase179_chain_complete_confirmed',
      'final_non_execution_evidence_seal_verified',
      'token_never_unlocked_confirmed',
      'token_never_redeemable_confirmed',
      'token_never_redeemed_confirmed',
      'zero_runtime_mutation_confirmed'
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
        act_token_redempt_unlock_governance_readiness_closure_id: unlockGovernanceReadinessClosureId,
        rule_code: checkName.toUpperCase(),
        rule_description: `Verify that ${checkName} is confirmed.`,
        evaluation_status: rulePassed ? 'PASSED' : 'FAILED',
        evaluation_message: rulePassed ? 'Verification passed.' : `Missing required confirmation for ${checkName}.`,
        severity
      });
    }

    if (!isProdLike) {
      this._mockState.rules.set(unlockGovernanceReadinessClosureId, ruleResults);
      builderService._mockState.rules.set(unlockGovernanceReadinessClosureId, ruleResults);
    } else {
      await db.query(
        `DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_grc_rl
         WHERE act_token_redempt_unlock_governance_readiness_closure_id = ?`,
        [unlockGovernanceReadinessClosureId]
      );
      for (const rl of ruleResults) {
        await db.query(
          `INSERT INTO cb_cohort_intervention_activation_token_redempt_unlock_grc_rl
           (rule_log_id, act_token_redempt_unlock_governance_readiness_closure_id, rule_code, rule_description, evaluation_status, evaluation_message, severity)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [rl.rule_log_id, rl.act_token_redempt_unlock_governance_readiness_closure_id, rl.rule_code, rl.rule_description, rl.evaluation_status, rl.evaluation_message, rl.severity]
        );
      }
    }

    const updateFields = {
      unlock_governance_readiness_closure_status: 'EVALUATED',
      unlock_governance_readiness_closure_result: allRulesPassed ? 'GOVERNANCE_READINESS_CLOSED_NOT_UNLOCKED' : 'GOVERNANCE_READINESS_CLOSURE_FAILED',
      governance_readiness_closure_rules_json: ruleResults,
      governance_readiness_closure_snapshot_json: { allRulesPassed, evaluatedAt: new Date() }
    };

    await builderService._internalUpdateTokenRedemptionUnlockGovernanceReadinessClosure(unlockGovernanceReadinessClosureId, updateFields);
    await auditService.logAction(unlockGovernanceReadinessClosureId, 'UNLOCK_GOVERNANCE_READINESS_CLOSURE_EVALUATED', actorId);

    return { allRulesPassed, ruleResults };
  }

  async getRuleLogs(unlockGovernanceReadinessClosureId) {
    if (!isProdLike) {
      return this._mockState.rules.get(unlockGovernanceReadinessClosureId) || [];
    }
    return await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_grc_rl
       WHERE act_token_redempt_unlock_governance_readiness_closure_id = ?`,
      [unlockGovernanceReadinessClosureId]
    );
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosureEvaluatorService()
};
