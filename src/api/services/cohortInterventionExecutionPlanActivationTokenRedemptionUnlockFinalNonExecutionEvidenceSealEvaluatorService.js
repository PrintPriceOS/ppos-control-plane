'use strict';

const db = require('./mysqlClient');
const crypto = require('crypto');
const builderService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSealBuilderService').serviceInstance;
const auditService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSealAuditService').serviceInstance;

const isProdLike = process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSealEvaluatorService {
  constructor() {
    this._mockState = {
      rules: new Map()
    };
  }

  async evaluateUnlockFinalNonExecutionEvidenceSeal(unlockFinalNonExecutionEvidenceSealId, confirmations = {}, actorId) {
    const record = await builderService.getTokenRedemptionUnlockFinalNonExecutionEvidenceSeal(unlockFinalNonExecutionEvidenceSealId);
    if (!record) {
      throw new Error(`Record ${unlockFinalNonExecutionEvidenceSealId} not found.`);
    }

    if (record.unlock_final_non_execution_evidence_seal_status !== 'DRAFT') {
      throw new Error(`Record must be in DRAFT status to evaluate. Current status: ${record.unlock_final_non_execution_evidence_seal_status}`);
    }

    if (!record.evidence_seal_officer_id) {
      throw new Error('EVIDENCE_SEAL_OFFICER_MISSING');
    }

    const allowedRoles = ['audit_officer', 'compliance_officer', 'risk_officer', 'security_officer', 'governance_officer'];
    if (!allowedRoles.includes(record.evidence_seal_officer_role)) {
      throw new Error('EVIDENCE_SEAL_OFFICER_ROLE_INVALID');
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
      record.kill_switch_verification_officer_id
    ];
    if (priorIds.includes(record.evidence_seal_officer_id)) {
      throw new Error('EVIDENCE_SEAL_OFFICER_DUPLICATES_PRIOR_AUTHORIZER_FORBIDDEN');
    }

    const checklist = [
      'final_non_execution_evidence_seal_confirmation',
      'token_never_unlocked_confirmed',
      'token_never_redeemable_confirmed',
      'token_never_redeemed_confirmed',
      'high_risk_execution_never_enabled_confirmed',
      'plan_never_executable_confirmed',
      'no_real_job_created_confirmed',
      'no_queue_dispatch_confirmed',
      'zero_runtime_mutation_confirmed',
      'kill_switch_dry_run_verified',
      'emergency_rollback_authority_verified',
      'legal_policy_hold_clearance_verified',
      'risk_officer_countersign_verified',
      'compliance_witness_attestation_verified',
      'final_human_authorization_seal_verified',
      'dual_control_authorization_verified',
      'lineage_integrity_verified'
    ];

    const criticalChecks = [
      'token_never_unlocked_confirmed',
      'token_never_redeemable_confirmed',
      'token_never_redeemed_confirmed',
      'high_risk_execution_never_enabled_confirmed',
      'no_real_job_created_confirmed',
      'no_queue_dispatch_confirmed',
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
        act_token_redempt_unlock_final_non_execution_evidence_seal_id: unlockFinalNonExecutionEvidenceSealId,
        rule_code: checkName.toUpperCase(),
        rule_description: `Verify that ${checkName} is confirmed.`,
        evaluation_status: rulePassed ? 'PASSED' : 'FAILED',
        evaluation_message: rulePassed ? 'Verification passed.' : `Missing required confirmation for ${checkName}.`,
        severity
      });
    }

    if (!isProdLike) {
      this._mockState.rules.set(unlockFinalNonExecutionEvidenceSealId, ruleResults);
      builderService._mockState.rules.set(unlockFinalNonExecutionEvidenceSealId, ruleResults);
    } else {
      await db.query(
        `DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_fnees_rl
         WHERE act_token_redempt_unlock_final_non_execution_evidence_seal_id = ?`,
        [unlockFinalNonExecutionEvidenceSealId]
      );
      for (const rl of ruleResults) {
        await db.query(
          `INSERT INTO cb_cohort_intervention_activation_token_redempt_unlock_fnees_rl
           (rule_log_id, act_token_redempt_unlock_final_non_execution_evidence_seal_id, rule_code, rule_description, evaluation_status, evaluation_message, severity)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [rl.rule_log_id, rl.act_token_redempt_unlock_final_non_execution_evidence_seal_id, rl.rule_code, rl.rule_description, rl.evaluation_status, rl.evaluation_message, rl.severity]
        );
      }
    }

    const updateFields = {
      unlock_final_non_execution_evidence_seal_status: 'EVALUATED',
      unlock_final_non_execution_evidence_seal_result: allRulesPassed ? 'FINAL_NON_EXECUTION_EVIDENCE_SEALED_NOT_UNLOCKED' : 'FINAL_NON_EXECUTION_EVIDENCE_SEAL_FAILED',
      final_non_execution_evidence_rules_json: ruleResults,
      non_execution_invariant_snapshot_json: { allRulesPassed, evaluatedAt: new Date() }
    };

    await builderService._internalUpdateTokenRedemptionUnlockFinalNonExecutionEvidenceSeal(unlockFinalNonExecutionEvidenceSealId, updateFields);
    await auditService.logAction(unlockFinalNonExecutionEvidenceSealId, 'UNLOCK_FINAL_NON_EXECUTION_EVIDENCE_SEAL_EVALUATED', actorId);

    return { allRulesPassed, ruleResults };
  }

  async getRuleLogs(unlockFinalNonExecutionEvidenceSealId) {
    if (!isProdLike) {
      return this._mockState.rules.get(unlockFinalNonExecutionEvidenceSealId) || [];
    }
    return await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_fnees_rl
       WHERE act_token_redempt_unlock_final_non_execution_evidence_seal_id = ?`,
      [unlockFinalNonExecutionEvidenceSealId]
    );
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSealEvaluatorService()
};
