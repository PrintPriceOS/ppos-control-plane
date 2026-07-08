'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const builder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalReviewBuilderService').serviceInstance;
const apvBuilder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalBuilderService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalReviewEvaluatorService {
  async evaluateUnlockFinalReview(finalReviewId, confirmations, actorId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    const record = await builder.getTokenRedemptionUnlockFinalReview(finalReviewId);
    if (!record) throw new Error('UNLOCK_FINAL_REVIEW_RECORD_NOT_FOUND');

    let parent = null;
    if (!isProdLike) {
      parent = apvBuilder._mockState.tokenRedemptionUnlockApproval.get(record.source_activation_token_redemption_unlock_approval_id);
    } else {
      const rows = await db.query(
        `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_apv WHERE activation_token_redemption_unlock_approval_id = ?`,
        [record.source_activation_token_redemption_unlock_approval_id]
      );
      if (rows && rows[0]) parent = rows[0];
    }

    if (!parent) {
      throw new Error(`UNLOCK_APPROVAL_NOT_FOUND: Parent approval record not found.`);
    }

    const rules = [];
    const addRule = (checkType, severity, description) => {
      rules.push({
        rule_id: `rul_${crypto.randomBytes(8).toString('hex')}`,
        activation_token_redemption_unlock_final_review_id: finalReviewId,
        check_type: checkType,
        severity,
        description,
        created_at: new Date()
      });
    };

    // 1. Parent Phase 167 finalized
    if (parent.unlock_approval_status === 'FINALIZED') {
      addRule('PHASE167_APPROVAL_VALIDATION', 'INFO', 'Verified parent Phase 167 approval is finalized.');
    } else {
      addRule('PHASE167_APPROVAL_VALIDATION', 'CRITICAL', 'Parent Phase 167 approval is not finalized.');
    }

    // 2. Parent Phase 167 result is UNLOCK_APPROVAL_PASSED_NOT_UNLOCKED
    if (parent.unlock_approval_result === 'UNLOCK_APPROVAL_PASSED_NOT_UNLOCKED') {
      addRule('PHASE167_RESULT_VALIDATION', 'INFO', 'Verified parent Phase 167 result is UNLOCK_APPROVAL_PASSED_NOT_UNLOCKED.');
    } else {
      addRule('PHASE167_RESULT_VALIDATION', 'CRITICAL', 'Parent Phase 167 result is invalid.');
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

    // 5. Token redemption is locked
    if (record.token_redemption_status === 'LOCKED_NOT_REDEEMED') {
      addRule('TOKEN_REDEMPTION_VALIDATION', 'INFO', 'Verified token redemption status is LOCKED_NOT_REDEEMED.');
    } else {
      addRule('TOKEN_REDEMPTION_VALIDATION', 'CRITICAL', 'Token redemption status is invalid.');
    }

    // 6. Execution remains disabled
    if (record.execution_capability_status === 'EXECUTION_NOT_ENABLED') {
      addRule('EXECUTION_CAPABILITY_VALIDATION', 'INFO', 'Verified execution capability status is EXECUTION_NOT_ENABLED.');
    } else {
      addRule('EXECUTION_CAPABILITY_VALIDATION', 'CRITICAL', 'Execution capability status is enabled.');
    }

    // 7. Plan remains not executable
    if (record.plan_executable_status === 'NOT_EXECUTABLE') {
      addRule('PLAN_EXECUTABLE_VALIDATION', 'INFO', 'Verified plan executable status is NOT_EXECUTABLE.');
    } else {
      addRule('PLAN_EXECUTABLE_VALIDATION', 'CRITICAL', 'Plan executable status is enabled.');
    }

    // 8. Package freeze remains immutable
    if (record.package_freeze_status === 'FROZEN_IMMUTABLE' && record.redemption_package_freeze_status === 'REDEMPTION_PACKAGE_FROZEN_IMMUTABLE') {
      addRule('PACKAGE_FREEZE_VALIDATION', 'INFO', 'Verified package freeze remains FROZEN_IMMUTABLE.');
    } else {
      addRule('PACKAGE_FREEZE_VALIDATION', 'CRITICAL', 'Package freeze status has been compromised.');
    }

    // 9. Confirmations verification
    const requiredConfirmations = [
      'security_officer_confirmation',
      'compliance_officer_confirmation',
      'operations_director_confirmation',
      'rollback_authority_confirmation',
      'kill_switch_confirmation',
      'non_execution_confirmation',
      'final_review_no_unlock_confirmation'
    ];

    for (const conf of requiredConfirmations) {
      if (confirmations[conf] === true) {
        addRule(`${conf.toUpperCase()}_VERIFICATION`, 'INFO', `Verified ${conf.replace(/_/g, ' ')}.`);
      } else {
        addRule(`${conf.toUpperCase()}_VERIFICATION`, 'CRITICAL', `${conf.replace(/_/g, ' ')} is missing.`);
      }
    }

    // 10. Write scope limits validation
    if (record.write_scope_attestation_json && record.write_scope_attestation_json.scope === 'PHASE_168_TABLES_ONLY') {
      addRule('WRITE_SCOPE_VERIFICATION', 'INFO', 'Verified write scope limits. Only Phase 168 schema structures are targeted.');
    } else {
      addRule('WRITE_SCOPE_VERIFICATION', 'CRITICAL', 'Invalid write scope attestation.');
    }

    // 11. Hash verification
    const expectedHash = parent.unlock_approval_hash || 'apv_hash_dummy';
    if (record.source_unlock_approval_hash === expectedHash) {
      addRule('APPROVAL_HASH_VERIFICATION', 'INFO', 'Verified parent approval hash matches parent record.');
    } else {
      addRule('APPROVAL_HASH_VERIFICATION', 'CRITICAL', 'Parent approval hash mismatch.');
    }

    const hasCritical = rules.some(r => r.severity === 'CRITICAL');
    const guardrailStatus = hasCritical ? 'FAIL' : 'PASS';
    const writeScopeStatus = hasCritical ? 'FAIL' : 'PASS';
    const finalReviewResult = hasCritical ? 'FINAL_REVIEW_BLOCKED_BY_GUARDRAIL' : 'FINAL_REVIEW_PASSED_NOT_UNLOCKED';
    const finalReviewStatus = hasCritical ? 'BLOCKED' : 'EVALUATED';

    if (!isProdLike) {
      builder._mockState.rules.set(finalReviewId, rules);
    } else {
      await db.query(`DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_frev_rl WHERE activation_token_redemption_unlock_final_review_id = ?`, [finalReviewId]);
      for (const rule of rules) {
        await db.query(
          `INSERT INTO cb_cohort_intervention_activation_token_redempt_unlock_frev_rl
           (rule_id, activation_token_redemption_unlock_final_review_id, check_type, severity, description)
           VALUES (?, ?, ?, ?, ?)`,
          [rule.rule_id, rule.activation_token_redemption_unlock_final_review_id, rule.check_type, rule.severity, rule.description]
        );
      }
    }

    const updated = await builder._internalUpdateUnlockFinalReview(finalReviewId, {
      unlock_final_review_status: finalReviewStatus,
      unlock_final_review_result: finalReviewResult,
      guardrail_status: guardrailStatus,
      write_scope_status: writeScopeStatus,
      unlock_final_review_rules_json: rules
    });

    return { tokenRedemptionUnlockFinalReview: updated, rules };
  }

  async getRules(finalReviewId) {
    return await builder.getRules(finalReviewId);
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalReviewEvaluatorService()
};
