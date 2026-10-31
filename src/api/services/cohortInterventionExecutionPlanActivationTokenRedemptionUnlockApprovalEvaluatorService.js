'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const builder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalBuilderService').serviceInstance;
const eligBuilder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibilityBuilderService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalEvaluatorService {
  async evaluateUnlockApproval(unlockApprovalId, confirmations, actorId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    const record = await builder.getTokenRedemptionUnlockApproval(unlockApprovalId);
    if (!record) throw new Error('UNLOCK_APPROVAL_RECORD_NOT_FOUND');

    let parent = null;
    if (!isProdLike) {
      parent = eligBuilder._mockState.tokenRedemptionUnlockEligibility.get(record.source_activation_token_redemption_unlock_eligibility_id);
    } else {
      const rows = await db.query(
        `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_elig WHERE activation_token_redemption_unlock_eligibility_id = ?`,
        [record.source_activation_token_redemption_unlock_eligibility_id]
      );
      if (rows && rows[0]) parent = rows[0];
    }

    if (!parent) {
      throw new Error(`UNLOCK_ELIGIBILITY_NOT_FOUND: Parent eligibility record not found.`);
    }

    const rules = [];
    const addRule = (checkType, severity, description) => {
      rules.push({
        rule_id: `rul_${crypto.randomBytes(8).toString('hex')}`,
        activation_token_redemption_unlock_approval_id: unlockApprovalId,
        check_type: checkType,
        severity,
        description,
        created_at: new Date()
      });
    };

    // 1. Parent Phase 166 finalized
    if (parent.unlock_eligibility_status === 'FINALIZED') {
      addRule('PHASE166_ELIGIBILITY_VALIDATION', 'INFO', 'Verified parent Phase 166 eligibility is finalized.');
    } else {
      addRule('PHASE166_ELIGIBILITY_VALIDATION', 'CRITICAL', 'Parent Phase 166 eligibility is not finalized.');
    }

    // 2. Parent Phase 166 result is UNLOCK_ELIGIBILITY_PASSED_NOT_UNLOCKED
    if (parent.unlock_eligibility_result === 'UNLOCK_ELIGIBILITY_PASSED_NOT_UNLOCKED') {
      addRule('PHASE166_RESULT_VALIDATION', 'INFO', 'Verified parent Phase 166 result is UNLOCK_ELIGIBILITY_PASSED_NOT_UNLOCKED.');
    } else {
      addRule('PHASE166_RESULT_VALIDATION', 'CRITICAL', 'Parent Phase 166 result is invalid.');
    }

    // 3. Token is still locked
    if (record.token_unlock_status === 'NOT_UNLOCKED') {
      addRule('TOKEN_UNLOCK_STATUS_VALIDATION', 'INFO', 'Verified token actual unlock status is NOT_UNLOCKED.');
    } else {
      addRule('TOKEN_UNLOCK_STATUS_VALIDATION', 'CRITICAL', 'Token actual unlock status is invalid (token has been unlocked).');
    }

    // 4. Token is still not redeemable
    if (record.token_redeemable_status === 'NOT_REDEEMABLE') {
      addRule('TOKEN_REDEEMABLE_VALIDATION', 'INFO', 'Verified token redeemable status remains NOT_REDEEMABLE.');
    } else {
      addRule('TOKEN_REDEEMABLE_VALIDATION', 'CRITICAL', 'Token redeemable status is invalid.');
    }

    // 5. Execution remains disabled
    if (record.execution_capability_status === 'EXECUTION_NOT_ENABLED') {
      addRule('EXECUTION_CAPABILITY_VALIDATION', 'INFO', 'Verified execution capability status is EXECUTION_NOT_ENABLED.');
    } else {
      addRule('EXECUTION_CAPABILITY_VALIDATION', 'CRITICAL', 'Execution capability status is enabled.');
    }

    // 6. Package freeze remains immutable
    if (record.package_freeze_status === 'FROZEN_IMMUTABLE' && record.redemption_package_freeze_status === 'REDEMPTION_PACKAGE_FROZEN_IMMUTABLE') {
      addRule('PACKAGE_FREEZE_VALIDATION', 'INFO', 'Verified package freeze remains FROZEN_IMMUTABLE.');
    } else {
      addRule('PACKAGE_FREEZE_VALIDATION', 'CRITICAL', 'Package freeze status has been compromised.');
    }

    // 7. Security/operator confirmations
    if (confirmations.security_officer_confirmed === true) {
      addRule('SECURITY_SIGNATURE_VERIFICATION', 'INFO', 'Verified security officer unlock approval confirmation.');
    } else {
      addRule('SECURITY_SIGNATURE_VERIFICATION', 'CRITICAL', 'Security officer unlock approval confirmation is missing.');
    }

    if (confirmations.compliance_officer_confirmed === true) {
      addRule('COMPLIANCE_SIGNATURE_VERIFICATION', 'INFO', 'Verified compliance officer unlock approval confirmation.');
    } else {
      addRule('COMPLIANCE_SIGNATURE_VERIFICATION', 'CRITICAL', 'Compliance officer unlock approval confirmation is missing.');
    }

    // 8. Write scope limits validation
    if (record.write_scope_attestation_json && record.write_scope_attestation_json.writes_only_phase167_tables === true) {
      addRule('WRITE_SCOPE_VERIFICATION', 'INFO', 'Verified write scope limits. Only Phase 167 schema structures are targeted.');
    } else {
      addRule('WRITE_SCOPE_VERIFICATION', 'CRITICAL', 'Invalid write scope attestation.');
    }

    // 9. Config validation
    if (record.canary_envelope_json && record.canary_envelope_json.unlock_approval_mode === 'TOKEN_REDEMPTION_UNLOCK_APPROVAL_GATE_ONLY') {
      addRule('UNLOCK_APPROVAL_CONFIG_VALIDATION', 'INFO', 'Unlock approval configuration verified.');
    } else {
      addRule('UNLOCK_APPROVAL_CONFIG_VALIDATION', 'CRITICAL', 'Unlock approval configuration is invalid or missing.');
    }

    // 10. Hash verification
    const expectedHash = parent.unlock_eligibility_hash || 'elig_hash_dummy';
    if (record.source_unlock_eligibility_hash === expectedHash) {
      addRule('ELIGIBILITY_HASH_VERIFICATION', 'INFO', 'Verified parent eligibility hash matches parent record.');
    } else {
      addRule('ELIGIBILITY_HASH_VERIFICATION', 'CRITICAL', 'Parent eligibility hash mismatch.');
    }

    const hasCritical = rules.some(r => r.severity === 'CRITICAL');
    const guardrailStatus = hasCritical ? 'FAIL' : 'PASS';
    const writeScopeStatus = hasCritical ? 'FAIL' : 'PASS';
    const approvalResult = hasCritical ? 'UNLOCK_APPROVAL_BLOCKED_BY_GUARDRAIL' : 'UNLOCK_APPROVAL_PASSED_NOT_UNLOCKED';
    const approvalStatus = hasCritical ? 'BLOCKED' : 'EVALUATED';

    if (!isProdLike) {
      builder._mockState.rules.set(unlockApprovalId, rules);
    } else {
      await db.query(`DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_apv_rl WHERE activation_token_redemption_unlock_approval_id = ?`, [unlockApprovalId]);
      for (const rule of rules) {
        await db.query(
          `INSERT INTO cb_cohort_intervention_activation_token_redempt_unlock_apv_rl
           (rule_id, activation_token_redemption_unlock_approval_id, check_type, severity, description)
           VALUES (?, ?, ?, ?, ?)`,
          [rule.rule_id, rule.activation_token_redemption_unlock_approval_id, rule.check_type, rule.severity, rule.description]
        );
      }
    }

    const updated = await builder._internalUpdateUnlockApproval(unlockApprovalId, {
      unlock_approval_status: approvalStatus,
      unlock_approval_result: approvalResult,
      guardrail_status: guardrailStatus,
      write_scope_status: writeScopeStatus,
      unlock_approval_rules_json: rules
    });

    return { tokenRedemptionUnlockApproval: updated, rules };
  }

  async getRules(unlockApprovalId) {
    return await builder.getRules(unlockApprovalId);
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalEvaluatorService()
};
