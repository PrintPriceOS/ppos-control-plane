'use strict';

const db = require('./mysqlClient');
const crypto = require('crypto');
const builder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldBuilderService').serviceInstance;

const isProdLike = process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldEvaluatorService {
  async evaluateUnlockLegalPolicyHold(unlockLegalPolicyHoldId, confirmations, actorId) {
    const record = await builder.getTokenRedemptionUnlockLegalPolicyHold(unlockLegalPolicyHoldId);
    if (!record) {
      throw new Error(`Legal/policy hold record ${unlockLegalPolicyHoldId} not found.`);
    }

    if (record.unlock_legal_policy_hold_status === 'FINALIZED') {
      throw new Error(`Legal/policy hold record is finalized and cannot be evaluated.`);
    }

    const rules = [];
    const addRule = (checkType, severity, description) => {
      const ruleId = 'rul_' + crypto.randomBytes(8).toString('hex');
      rules.push({
        rule_log_id: ruleId,
        act_token_redempt_unlock_legal_policy_hold_id: unlockLegalPolicyHoldId,
        rule_id: ruleId,
        check_type: checkType,
        severity: severity,
        description: description,
        created_by: actorId,
        updated_by: actorId
      });
    };

    // 1. Parent finalized
    if (record.unlock_risk_officer_countersign_status === 'FINALIZED') {
      addRule('PHASE175_RISK_OFFICER_COUNTERSIGN_VALIDATION', 'INFO', 'Verified parent Phase 175 risk officer countersign is finalized.');
    } else {
      addRule('PHASE175_RISK_OFFICER_COUNTERSIGN_VALIDATION', 'CRITICAL', 'Parent Phase 175 risk officer countersign is not finalized.');
    }

    // 2. Legal Policy Officer ID Present
    if (record.legal_policy_officer_id) {
      addRule('LEGAL_POLICY_OFFICER_ID_PRESENT', 'INFO', 'Verified Legal Policy Officer ID is recorded.');
    } else {
      addRule('LEGAL_POLICY_OFFICER_ID_PRESENT', 'CRITICAL', 'Legal Policy Officer ID is missing.');
    }

    // 3. Legal Policy Officer Role Allowed
    const allowedRoles = ['legal_officer', 'policy_officer', 'compliance_legal_officer', 'governance_legal_officer', 'general_counsel'];
    if (allowedRoles.includes(record.legal_policy_officer_role)) {
      addRule('LEGAL_POLICY_OFFICER_ROLE_VALID', 'INFO', 'Verified Legal Policy Officer role is valid.');
    } else {
      addRule('LEGAL_POLICY_OFFICER_ROLE_VALID', 'CRITICAL', 'Legal Policy Officer role is invalid.');
    }

    // 4. Separation of Duties - Primary Authorizer
    if (record.legal_policy_officer_id !== record.primary_authorizer_id) {
      addRule('LEGAL_POLICY_OFFICER_SEPARATION_PRIMARY', 'INFO', 'Legal Policy Officer is independent from primary authorizer.');
    } else {
      addRule('LEGAL_POLICY_OFFICER_SEPARATION_PRIMARY', 'CRITICAL', 'Legal Policy Officer duplicates the primary authorizer.');
    }

    // 5. Separation of Duties - Secondary Authorizer
    if (record.legal_policy_officer_id !== record.secondary_authorizer_id) {
      addRule('LEGAL_POLICY_OFFICER_SEPARATION_SECONDARY', 'INFO', 'Legal Policy Officer is independent from secondary authorizer.');
    } else {
      addRule('LEGAL_POLICY_OFFICER_SEPARATION_SECONDARY', 'CRITICAL', 'Legal Policy Officer duplicates the secondary authorizer.');
    }

    // 6. Separation of Duties - Final Human Seal Authorizer
    if (record.legal_policy_officer_id !== record.final_human_authorizer_id) {
      addRule('LEGAL_POLICY_OFFICER_SEPARATION_FINAL_HUMAN', 'INFO', 'Legal Policy Officer is independent from final human authorizer.');
    } else {
      addRule('LEGAL_POLICY_OFFICER_SEPARATION_FINAL_HUMAN', 'CRITICAL', 'Legal Policy Officer duplicates the final human authorizer.');
    }

    // 7. Separation of Duties - Compliance Witness
    if (record.legal_policy_officer_id !== record.compliance_witness_id) {
      addRule('LEGAL_POLICY_OFFICER_SEPARATION_COMPLIANCE_WITNESS', 'INFO', 'Legal Policy Officer is independent from compliance witness.');
    } else {
      addRule('LEGAL_POLICY_OFFICER_SEPARATION_COMPLIANCE_WITNESS', 'CRITICAL', 'Legal Policy Officer duplicates the compliance witness.');
    }

    // 8. Separation of Duties - Risk Officer
    if (record.legal_policy_officer_id !== record.risk_officer_id) {
      addRule('LEGAL_POLICY_OFFICER_SEPARATION_RISK_OFFICER', 'INFO', 'Legal Policy Officer is independent from risk officer.');
    } else {
      addRule('LEGAL_POLICY_OFFICER_SEPARATION_RISK_OFFICER', 'CRITICAL', 'Legal Policy Officer duplicates the risk officer.');
    }

    // 9. Safety boundary checks
    if (record.token_unlock_status === 'NOT_UNLOCKED') {
      addRule('TOKEN_UNLOCK_BOUNDARY', 'INFO', 'Verified token remains locked.');
    } else {
      addRule('TOKEN_UNLOCK_BOUNDARY', 'CRITICAL', 'Token unlock status breached.');
    }

    if (record.token_redeemable_status === 'NOT_REDEEMABLE') {
      addRule('TOKEN_REDEEMABLE_BOUNDARY', 'INFO', 'Verified token remains not redeemable.');
    } else {
      addRule('TOKEN_REDEEMABLE_BOUNDARY', 'CRITICAL', 'Token redeemable status breached.');
    }

    if (record.token_redemption_status === 'LOCKED_NOT_REDEEMED') {
      addRule('TOKEN_REDEMPTION_BOUNDARY', 'INFO', 'Verified token remains locked and not redeemed.');
    } else {
      addRule('TOKEN_REDEMPTION_BOUNDARY', 'CRITICAL', 'Token redemption status breached.');
    }

    if (record.plan_executable_status === 'NOT_EXECUTABLE') {
      addRule('PLAN_EXECUTABLE_BOUNDARY', 'INFO', 'Verified plan is not executable.');
    } else {
      addRule('PLAN_EXECUTABLE_BOUNDARY', 'CRITICAL', 'Plan executable status breached.');
    }

    if (record.job_creation_status === 'NO_REAL_JOB_CREATED') {
      addRule('JOB_CREATION_BOUNDARY', 'INFO', 'Verified zero real jobs created.');
    } else {
      addRule('JOB_CREATION_BOUNDARY', 'CRITICAL', 'Job creation status breached.');
    }

    if (record.queue_dispatch_status === 'NO_QUEUE_DISPATCHED') {
      addRule('QUEUE_DISPATCH_BOUNDARY', 'INFO', 'Verified zero queues dispatched.');
    } else {
      addRule('QUEUE_DISPATCH_BOUNDARY', 'CRITICAL', 'Queue dispatch status breached.');
    }

    if (record.runtime_mutation_status === 'ZERO_RUNTIME_MUTATION_CONFIRMED') {
      addRule('RUNTIME_MUTATION_BOUNDARY', 'INFO', 'Verified zero runtime mutations confirmed.');
    } else {
      addRule('RUNTIME_MUTATION_BOUNDARY', 'CRITICAL', 'Runtime mutation status breached.');
    }

    if (record.write_scope_status === 'PASSED' || record.write_scope_status === 'PASS') {
      addRule('WRITE_SCOPE_BOUNDS_CHECK', 'INFO', 'Verified database writes are bounded to Phase 176 tables only.');
    } else {
      addRule('WRITE_SCOPE_BOUNDS_CHECK', 'CRITICAL', 'Write scope bounds check failed.');
    }

    // 14 confirmations
    const checkConfirm = (key, label) => {
      if (confirmations && confirmations[key] === true) {
        addRule(label, 'INFO', `Verified confirmation: ${key}`);
      } else {
        addRule(label, 'CRITICAL', `Missing required confirmation: ${key}`);
      }
    };

    checkConfirm('legal_policy_hold_clearance_confirmation', 'LEGAL_POLICY_HOLD_CLEARANCE_CONFIRMATION');
    checkConfirm('no_active_legal_hold_confirmed', 'NO_ACTIVE_LEGAL_HOLD_CONFIRMED');
    checkConfirm('no_active_policy_hold_confirmed', 'NO_ACTIVE_POLICY_HOLD_CONFIRMED');
    checkConfirm('no_active_compliance_freeze_confirmed', 'NO_ACTIVE_COMPLIANCE_FREEZE_CONFIRMED');
    checkConfirm('risk_officer_countersign_verified', 'RISK_OFFICER_COUNTERSIGN_VERIFIED');
    checkConfirm('compliance_witness_attestation_verified', 'COMPLIANCE_WITNESS_ATTESTATION_VERIFIED');
    checkConfirm('final_human_seal_authorizer_unlock_seal_verified', 'FINAL_HUMAN_SEAL_AUTHORIZER_UNLOCK_SEAL_VERIFIED');
    checkConfirm('primary_authorizer_unlock_authorization_verified', 'PRIMARY_AUTHORIZER_UNLOCK_AUTHORIZATION_VERIFIED');
    checkConfirm('secondary_authorizer_unlock_authorization_verified', 'SECONDARY_AUTHORIZER_UNLOCK_AUTHORIZATION_VERIFIED');
    checkConfirm('kill_switch_verified', 'KILL_SWITCH_VERIFIED');
    checkConfirm('non_execution_confirmed', 'NON_EXECUTION_CONFIRMED');
    checkConfirm('final_review_unlock_readiness_verified', 'FINAL_REVIEW_UNLOCK_READINESS_VERIFIED');
    checkConfirm('seal_authenticity_confirmed', 'SEAL_AUTHENTICITY_CONFIRMED');
    checkConfirm('pre_execution_state_sealed_confirmed', 'PRE_EXECUTION_STATE_SEALED_CONFIRMED');

    // Force failure if hold is present
    if (confirmations && confirmations.no_active_legal_hold_confirmed === false) {
      addRule('ACTIVE_LEGAL_HOLD_PRESENT', 'CRITICAL', 'Active legal hold is present.');
    }
    if (confirmations && confirmations.no_active_policy_hold_confirmed === false) {
      addRule('ACTIVE_POLICY_HOLD_PRESENT', 'CRITICAL', 'Active policy hold is present.');
    }
    if (confirmations && confirmations.no_active_compliance_freeze_confirmed === false) {
      addRule('ACTIVE_COMPLIANCE_FREEZE_PRESENT', 'CRITICAL', 'Active compliance freeze is present.');
    }

    const hasCritical = rules.some(r => r.severity === 'CRITICAL');
    const guardrailStatus = hasCritical ? 'FAIL' : 'PASS';
    const writeScopeStatus = hasCritical ? 'FAIL' : 'PASS';
    const lphResult = hasCritical ? 'LEGAL_POLICY_HOLD_CONFIRMATION_FAILED' : 'LEGAL_POLICY_HOLD_CLEARED_NOT_UNLOCKED';
    const lphStatus = hasCritical ? 'BLOCKED' : 'EVALUATED';

    if (!isProdLike) {
      builder._mockState.rules.set(unlockLegalPolicyHoldId, rules);
    } else {
      await db.query(`DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_lph_rl WHERE act_token_redempt_unlock_legal_policy_hold_id = ?`, [unlockLegalPolicyHoldId]);
      for (const rule of rules) {
        await db.query(
          `INSERT INTO cb_cohort_intervention_activation_token_redempt_unlock_lph_rl
           (rule_log_id, act_token_redempt_unlock_legal_policy_hold_id, rule_id, check_type, severity, description, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [rule.rule_log_id, rule.act_token_redempt_unlock_legal_policy_hold_id, rule.rule_id, rule.check_type, rule.severity, rule.description, actorId, actorId]
        );
      }
    }

    const updated = await builder._internalUpdateUnlockLegalPolicyHold(unlockLegalPolicyHoldId, {
      unlock_legal_policy_hold_status: lphStatus,
      unlock_legal_policy_hold_result: lphResult,
      guardrail_status: guardrailStatus,
      write_scope_status: writeScopeStatus,
      unlock_legal_policy_hold_rules_json: rules
    });

    return {
      tokenRedemptionUnlockLegalPolicyHold: updated,
      rules
    };
  }

  async getRuleResults(unlockLegalPolicyHoldId) {
    if (!isProdLike) {
      return builder._mockState.rules.get(unlockLegalPolicyHoldId) || [];
    }
    return await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_lph_rl
       WHERE act_token_redempt_unlock_legal_policy_hold_id = ?`,
      [unlockLegalPolicyHoldId]
    );
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldEvaluatorService()
};
