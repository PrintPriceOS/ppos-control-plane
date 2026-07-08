'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const builder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibilityBuilderService').serviceInstance;
const lockBuilder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionLockBuilderService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibilityEvaluatorService {
  async evaluateUnlockEligibility(unlockEligibilityId, confirmations, actorId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    const record = await builder.getTokenRedemptionUnlockEligibility(unlockEligibilityId);
    if (!record) throw new Error('UNLOCK_ELIGIBILITY_RECORD_NOT_FOUND');

    let parent = null;
    if (!isProdLike) {
      parent = lockBuilder._mockState.tokenRedemptionLock.get(record.source_activation_token_redemption_lock_id);
    } else {
      const rows = await db.query(
        `SELECT * FROM cb_cohort_intervention_activation_token_redempt_lock WHERE activation_token_redemption_lock_id = ?`,
        [record.source_activation_token_redemption_lock_id]
      );
      if (rows && rows[0]) parent = rows[0];
    }

    if (!parent) {
      throw new Error(`TOKEN_REDEMPTION_LOCK_NOT_FOUND: Parent Lock not found.`);
    }

    const rules = [];
    const addRule = (checkType, severity, description) => {
      rules.push({
        rule_id: `rul_${crypto.randomBytes(8).toString('hex')}`,
        activation_token_redemption_unlock_eligibility_id: unlockEligibilityId,
        check_type: checkType,
        severity,
        description,
        created_at: new Date()
      });
    };

    // 1. Parent Phase 165 finalized
    if (parent.activation_token_redemption_lock_status === 'FINALIZED') {
      addRule('PHASE165_LOCK_VALIDATION', 'INFO', 'Verified parent Phase 165 lock is finalized.');
    } else {
      addRule('PHASE165_LOCK_VALIDATION', 'CRITICAL', 'Parent Phase 165 lock is not finalized.');
    }

    // 2. Token remains non-redeemable
    if (record.token_redeemable_status === 'NOT_REDEEMABLE') {
      addRule('TOKEN_REDEEMABLE_VALIDATION', 'INFO', 'Verified token redeemable status remains NOT_REDEEMABLE.');
    } else {
      addRule('TOKEN_REDEEMABLE_VALIDATION', 'CRITICAL', 'Token redeemable status is invalid.');
    }

    // 3. actual_unlock_status remains NOT_UNLOCKED
    if (record.actual_unlock_status === 'NOT_UNLOCKED') {
      addRule('TOKEN_UNLOCK_STATUS_VALIDATION', 'INFO', 'Verified token actual unlock status is NOT_UNLOCKED.');
    } else {
      addRule('TOKEN_UNLOCK_STATUS_VALIDATION', 'CRITICAL', 'Token actual unlock status is invalid (token has been unlocked).');
    }

    // 4. Execution capability status is EXECUTION_NOT_ENABLED
    if (record.execution_capability_status === 'EXECUTION_NOT_ENABLED') {
      addRule('EXECUTION_CAPABILITY_VALIDATION', 'INFO', 'Verified execution capability status is EXECUTION_NOT_ENABLED.');
    } else {
      addRule('EXECUTION_CAPABILITY_VALIDATION', 'CRITICAL', 'Execution capability status is enabled.');
    }

    // 5. Package freeze status remains FROZEN_IMMUTABLE
    if (record.package_freeze_status === 'FROZEN_IMMUTABLE' && record.redemption_package_freeze_status === 'REDEMPTION_PACKAGE_FROZEN_IMMUTABLE') {
      addRule('PACKAGE_FREEZE_VALIDATION', 'INFO', 'Verified package freeze remains FROZEN_IMMUTABLE.');
    } else {
      addRule('PACKAGE_FREEZE_VALIDATION', 'CRITICAL', 'Package freeze status has been compromised.');
    }

    // 6. Required confirmations
    if (confirmations.security_officer_confirmed === true) {
      addRule('SECURITY_SIGNATURE_VERIFICATION', 'INFO', 'Verified security officer unlock eligibility confirmation.');
    } else {
      addRule('SECURITY_SIGNATURE_VERIFICATION', 'CRITICAL', 'Security officer unlock eligibility confirmation is missing.');
    }

    if (confirmations.compliance_officer_confirmed === true) {
      addRule('COMPLIANCE_SIGNATURE_VERIFICATION', 'INFO', 'Verified compliance officer unlock eligibility confirmation.');
    } else {
      addRule('COMPLIANCE_SIGNATURE_VERIFICATION', 'CRITICAL', 'Compliance officer unlock eligibility confirmation is missing.');
    }

    // 7. Write scope limits validation
    if (record.write_scope_attestation_json && record.write_scope_attestation_json.writes_only_phase166_tables === true) {
      addRule('WRITE_SCOPE_VERIFICATION', 'INFO', 'Verified write scope limits. Only Phase 166 schema structures are targeted.');
    } else {
      addRule('WRITE_SCOPE_VERIFICATION', 'CRITICAL', 'Invalid write scope attestation.');
    }

    // 8. Config validation
    if (record.canary_envelope_json && record.canary_envelope_json.unlock_eligibility_mode === 'TOKEN_REDEMPTION_UNLOCK_ELIGIBILITY_GATE_ONLY') {
      addRule('UNLOCK_ELIGIBILITY_CONFIG_VALIDATION', 'INFO', 'Unlock eligibility configuration verified.');
    } else {
      addRule('UNLOCK_ELIGIBILITY_CONFIG_VALIDATION', 'CRITICAL', 'Unlock eligibility configuration is invalid or missing.');
    }

    // 9. Hash verification
    const expectedLockHash = parent.activation_token_redemption_lock_hash || 'lock_hash_dummy';
    if (record.source_redemption_lock_hash === expectedLockHash) {
      addRule('LOCK_HASH_VERIFICATION', 'INFO', 'Verified parent lock hash matches parent record.');
    } else {
      addRule('LOCK_HASH_VERIFICATION', 'CRITICAL', 'Parent lock hash mismatch.');
    }

    const hasCritical = rules.some(r => r.severity === 'CRITICAL');
    const guardrailStatus = hasCritical ? 'FAIL' : 'PASS';
    const writeScopeStatus = hasCritical ? 'FAIL' : 'PASS';
    const eligibilityResult = hasCritical ? 'UNLOCK_ELIGIBILITY_BLOCKED_BY_GUARDRAIL' : 'UNLOCK_ELIGIBILITY_PASSED_NOT_UNLOCKED';
    const eligibilityStatus = hasCritical ? 'BLOCKED' : 'EVALUATED';

    if (!isProdLike) {
      builder._mockState.rules.set(unlockEligibilityId, rules);
    } else {
      // Clear rules
      await db.query(`DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_elig_rules WHERE activation_token_redemption_unlock_eligibility_id = ?`, [unlockEligibilityId]);
      for (const rule of rules) {
        await db.query(
          `INSERT INTO cb_cohort_intervention_activation_token_redempt_unlock_elig_rules
           (rule_id, activation_token_redemption_unlock_eligibility_id, check_type, severity, description)
           VALUES (?, ?, ?, ?, ?)`,
          [rule.rule_id, rule.activation_token_redemption_unlock_eligibility_id, rule.check_type, rule.severity, rule.description]
        );
      }
    }

    const updated = await builder._internalUpdateUnlockEligibility(unlockEligibilityId, {
      unlock_eligibility_status: eligibilityStatus,
      unlock_eligibility_result: eligibilityResult,
      guardrail_status: guardrailStatus,
      write_scope_status: writeScopeStatus,
      unlock_eligibility_rules_json: rules
    });

    return { tokenRedemptionUnlockEligibility: updated, rules };
  }

  async getLockRules(unlockEligibilityId) {
    return await builder.getRules(unlockEligibilityId);
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibilityEvaluatorService()
};
