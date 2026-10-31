'use strict';

const db = require('./mysqlClient');
const crypto = require('crypto');
const builder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersignBuilderService').serviceInstance;

const isProdLike = process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersignEvaluatorService {
  async evaluateUnlockRiskOfficerCountersign(unlockRiskOfficerCountersignId, confirmations, actorId) {
    const record = await builder.getTokenRedemptionUnlockRiskOfficerCountersign(unlockRiskOfficerCountersignId);
    if (!record) {
      throw new Error(`Risk officer countersign record ${unlockRiskOfficerCountersignId} not found.`);
    }

    if (record.unlock_risk_officer_countersign_status === 'FINALIZED') {
      throw new Error(`Risk officer countersign record is finalized and cannot be evaluated.`);
    }

    const rules = [];
    const addRule = (checkType, severity, description) => {
      const ruleId = 'rul_' + crypto.randomBytes(8).toString('hex');
      rules.push({
        rule_id: ruleId,
        act_token_redempt_unlock_risk_officer_countersign_id: unlockRiskOfficerCountersignId,
        check_type: checkType,
        severity: severity,
        description: description
      });
    };

    // 1. Parent finalized
    if (record.unlock_compliance_witness_status === 'FINALIZED') {
      addRule('PHASE174_COMPLIANCE_WITNESS_VALIDATION', 'INFO', 'Verified parent Phase 174 compliance witness is finalized.');
    } else {
      addRule('PHASE174_COMPLIANCE_WITNESS_VALIDATION', 'CRITICAL', 'Parent Phase 174 compliance witness is not finalized.');
    }

    // 2. Risk Officer ID Present
    if (record.risk_officer_id) {
      addRule('RISK_OFFICER_ID_PRESENT', 'INFO', 'Verified Risk Officer ID is recorded.');
    } else {
      addRule('RISK_OFFICER_ID_PRESENT', 'CRITICAL', 'Risk Officer ID is missing.');
    }

    // 3. Risk Officer Role Allowed
    const allowedRoles = ['risk_officer', 'chief_risk_officer', 'security_risk_officer', 'governance_risk_officer'];
    if (allowedRoles.includes(record.risk_officer_role)) {
      addRule('RISK_OFFICER_ROLE_VALID', 'INFO', 'Verified Risk Officer role is valid.');
    } else {
      addRule('RISK_OFFICER_ROLE_VALID', 'CRITICAL', 'Risk Officer role is invalid.');
    }

    // 4. Separation of Duties - Primary Authorizer
    if (record.risk_officer_id !== record.primary_authorizer_id) {
      addRule('RISK_OFFICER_SEPARATION_PRIMARY', 'INFO', 'Risk Officer is independent from primary authorizer.');
    } else {
      addRule('RISK_OFFICER_SEPARATION_PRIMARY', 'CRITICAL', 'Risk Officer duplicates the primary authorizer.');
    }

    // 5. Separation of Duties - Secondary Authorizer
    if (record.risk_officer_id !== record.secondary_authorizer_id) {
      addRule('RISK_OFFICER_SEPARATION_SECONDARY', 'INFO', 'Risk Officer is independent from secondary authorizer.');
    } else {
      addRule('RISK_OFFICER_SEPARATION_SECONDARY', 'CRITICAL', 'Risk Officer duplicates the secondary authorizer.');
    }

    // 6. Separation of Duties - Final Human Seal Authorizer
    if (record.risk_officer_id !== record.final_human_authorizer_id) {
      addRule('RISK_OFFICER_SEPARATION_FINAL_HUMAN', 'INFO', 'Risk Officer is independent from final human authorizer.');
    } else {
      addRule('RISK_OFFICER_SEPARATION_FINAL_HUMAN', 'CRITICAL', 'Risk Officer duplicates the final human authorizer.');
    }

    // 7. Separation of Duties - Compliance Witness
    if (record.risk_officer_id !== record.compliance_witness_id) {
      addRule('RISK_OFFICER_SEPARATION_COMPLIANCE_WITNESS', 'INFO', 'Risk Officer is independent from compliance witness.');
    } else {
      addRule('RISK_OFFICER_SEPARATION_COMPLIANCE_WITNESS', 'CRITICAL', 'Risk Officer duplicates the compliance witness.');
    }

    // 8. Safety boundary checks
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
      addRule('WRITE_SCOPE_BOUNDS_CHECK', 'INFO', 'Verified database writes are bounded to Phase 175 tables only.');
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

    checkConfirm('risk_officer_countersign_confirmation', 'RISK_OFFICER_COUNTERSIGN_CONFIRMATION');
    checkConfirm('compliance_witness_attestation_verified', 'COMPLIANCE_WITNESS_ATTESTATION_VERIFIED');
    checkConfirm('final_human_seal_authorizer_unlock_seal_verified', 'FINAL_HUMAN_SEAL_AUTHORIZER_UNLOCK_SEAL_VERIFIED');
    checkConfirm('primary_authorizer_unlock_authorization_verified', 'PRIMARY_AUTHORIZER_UNLOCK_AUTHORIZATION_VERIFIED');
    checkConfirm('secondary_authorizer_unlock_authorization_verified', 'SECONDARY_AUTHORIZER_UNLOCK_AUTHORIZATION_VERIFIED');
    checkConfirm('security_officer_unlock_attestation_verified', 'SECURITY_OFFICER_UNLOCK_ATTESTATION_VERIFIED');
    checkConfirm('compliance_officer_unlock_attestation_verified', 'COMPLIANCE_OFFICER_UNLOCK_ATTESTATION_VERIFIED');
    checkConfirm('operations_director_unlock_attestation_verified', 'OPERATIONS_DIRECTOR_UNLOCK_ATTESTATION_VERIFIED');
    checkConfirm('rollback_authority_unlock_attestation_verified', 'ROLLBACK_AUTHORITY_UNLOCK_ATTESTATION_VERIFIED');
    checkConfirm('kill_switch_verified', 'KILL_SWITCH_VERIFIED');
    checkConfirm('non_execution_confirmed', 'NON_EXECUTION_CONFIRMED');
    checkConfirm('final_review_unlock_readiness_verified', 'FINAL_REVIEW_UNLOCK_READINESS_VERIFIED');
    checkConfirm('seal_authenticity_confirmed', 'SEAL_AUTHENTICITY_CONFIRMED');
    checkConfirm('pre_execution_state_sealed_confirmed', 'PRE_EXECUTION_STATE_SEALED_CONFIRMED');

    const hasCritical = rules.some(r => r.severity === 'CRITICAL');
    const guardrailStatus = hasCritical ? 'FAIL' : 'PASS';
    const writeScopeStatus = hasCritical ? 'FAIL' : 'PASS';
    const rocResult = hasCritical ? 'RISK_OFFICER_COUNTERSIGN_BLOCKED_BY_GUARDRAIL' : 'RISK_OFFICER_COUNTERSIGNED_NOT_UNLOCKED';
    const rocStatus = hasCritical ? 'BLOCKED' : 'EVALUATED';

    if (!isProdLike) {
      builder._mockState.rules.set(unlockRiskOfficerCountersignId, rules);
    } else {
      await db.query(`DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_roc_rl WHERE act_token_redempt_unlock_risk_officer_countersign_id = ?`, [unlockRiskOfficerCountersignId]);
      for (const rule of rules) {
        await db.query(
          `INSERT INTO cb_cohort_intervention_activation_token_redempt_unlock_roc_rl
           (rule_id, act_token_redempt_unlock_risk_officer_countersign_id, check_type, severity, description)
           VALUES (?, ?, ?, ?, ?)`,
          [rule.rule_id, rule.act_token_redempt_unlock_risk_officer_countersign_id, rule.check_type, rule.severity, rule.description]
        );
      }
    }

    const updated = await builder._internalUpdateUnlockRiskOfficerCountersign(unlockRiskOfficerCountersignId, {
      unlock_risk_officer_countersign_status: rocStatus,
      unlock_risk_officer_countersign_result: rocResult,
      guardrail_status: guardrailStatus,
      write_scope_status: writeScopeStatus,
      unlock_risk_officer_countersign_rules_json: rules
    });

    return {
      tokenRedemptionUnlockRiskOfficerCountersign: updated,
      rules
    };
  }

  async getRuleResults(unlockRiskOfficerCountersignId) {
    if (!isProdLike) {
      return builder._mockState.rules.get(unlockRiskOfficerCountersignId) || [];
    }
    return await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_roc_rl
       WHERE act_token_redempt_unlock_risk_officer_countersign_id = ?`,
      [unlockRiskOfficerCountersignId]
    );
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersignEvaluatorService()
};
