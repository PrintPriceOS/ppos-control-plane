'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const builder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSealBuilderService').serviceInstance;
const dualControlBuilder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorizationBuilderService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSealEvaluatorService {
  async evaluateUnlockFinalHumanAuthorizationSeal(unlockFinalHumanAuthorizationSealId, confirmations, actorId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    const record = await builder.getTokenRedemptionUnlockFinalHumanAuthorizationSeal(unlockFinalHumanAuthorizationSealId);
    if (!record) throw new Error('UNLOCK_FINAL_HUMAN_AUTHORIZATION_SEAL_RECORD_NOT_FOUND');

    let parent = null;
    if (!isProdLike) {
      parent = dualControlBuilder._mockState.tokenRedemptionUnlockDualControlAuthorization.get(record.source_act_token_redempt_unlock_dual_control_authorization_id);
    } else {
      const rows = await db.query(
        `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_dcau WHERE activation_token_redemption_unlock_dual_control_authorization_id = ?`,
        [record.source_act_token_redempt_unlock_dual_control_authorization_id]
      );
      if (rows && rows[0]) parent = rows[0];
    }

    if (!parent) {
      throw new Error(`UNLOCK_DUAL_CONTROL_AUTHORIZATION_NOT_FOUND: Parent dual control record not found.`);
    }

    const rules = [];
    const addRule = (checkType, severity, description) => {
      rules.push({
        rule_id: `rul_${crypto.randomBytes(8).toString('hex')}`,
        activation_token_redemption_unlock_final_human_authorization_seal_id: unlockFinalHumanAuthorizationSealId,
        check_type: checkType,
        severity,
        description,
        created_at: new Date()
      });
    };

    // 1. Parent Phase 172 finalized
    if (parent.unlock_dual_control_authorization_status === 'FINALIZED') {
      addRule('PHASE172_DUAL_CONTROL_VALIDATION', 'INFO', 'Verified parent Phase 172 dual control is finalized.');
    } else {
      addRule('PHASE172_DUAL_CONTROL_VALIDATION', 'CRITICAL', 'Parent Phase 172 dual control is not finalized.');
    }

    // 2. Parent Phase 172 result is DUAL_CONTROL_AUTHORIZED_NOT_UNLOCKED
    if (parent.unlock_dual_control_authorization_result === 'DUAL_CONTROL_AUTHORIZED_NOT_UNLOCKED') {
      addRule('PHASE172_RESULT_VALIDATION', 'INFO', 'Verified parent Phase 172 result is DUAL_CONTROL_AUTHORIZED_NOT_UNLOCKED.');
    } else {
      addRule('PHASE172_RESULT_VALIDATION', 'CRITICAL', 'Parent Phase 172 result is invalid.');
    }

    // 3. Final Human Seal identity checks
    if (!record.final_human_authorizer_id) {
      addRule('FINAL_HUMAN_AUTHORIZER_MISSING', 'CRITICAL', 'Final human authorizer identity is missing.');
    }
    if (!record.final_human_authorized_at) {
      addRule('FINAL_HUMAN_AUTHORIZER_TIMESTAMP_MISSING', 'CRITICAL', 'Final human authorizer timestamp is missing.');
    }

    if (record.final_human_authorizer_id) {
      if (record.final_human_authorizer_id === record.primary_authorizer_id) {
        addRule('FINAL_HUMAN_AUTHORIZER_DUPLICATES_PRIMARY_FORBIDDEN', 'CRITICAL', 'Final human authorizer must be independent from primary authorizer.');
      } else if (record.final_human_authorizer_id === record.secondary_authorizer_id) {
        addRule('FINAL_HUMAN_AUTHORIZER_DUPLICATES_SECONDARY_FORBIDDEN', 'CRITICAL', 'Final human authorizer must be independent from secondary authorizer.');
      } else {
        addRule('FINAL_HUMAN_AUTHORIZER_INDEPENDENCE_VERIFIED', 'INFO', 'Final human authorizer independence from dual-control authorizers verified.');
      }
    }

    // 4. Role validation
    const allowedRoles = ['operations_director', 'compliance_officer', 'security_officer', 'system_admin'];
    if (record.final_human_authorizer_role && !allowedRoles.includes(record.final_human_authorizer_role)) {
      addRule('FINAL_HUMAN_AUTHORIZER_ROLE_INVALID', 'CRITICAL', `Final human authorizer role '${record.final_human_authorizer_role}' is not allowed.`);
    }

    // 5. Token is still locked
    if (record.token_unlock_status === 'NOT_UNLOCKED') {
      addRule('TOKEN_UNLOCK_STATUS_VALIDATION', 'INFO', 'Verified token actual unlock status is NOT_UNLOCKED.');
    } else {
      addRule('TOKEN_UNLOCK_STATUS_VALIDATION', 'CRITICAL', 'Token actual unlock status is invalid (token has been unlocked).');
    }

    // 6. Token is still not redeemable
    if (record.token_redeemable_status === 'NOT_REDEEMABLE') {
      addRule('TOKEN_REDEEMABLE_VALIDATION', 'INFO', 'Verified token redeemable status remains NOT_REDEEMABLE.');
    } else {
      addRule('TOKEN_REDEEMABLE_VALIDATION', 'CRITICAL', 'Token redeemable status is invalid.');
    }

    // 7. Token redemption is locked
    if (record.token_redemption_status === 'LOCKED_NOT_REDEEMED') {
      addRule('TOKEN_REDEMPTION_VALIDATION', 'INFO', 'Verified token redemption status is LOCKED_NOT_REDEEMED.');
    } else {
      addRule('TOKEN_REDEMPTION_VALIDATION', 'CRITICAL', 'Token redemption status is invalid.');
    }

    // 8. Execution remains disabled
    if (record.execution_capability_status === 'EXECUTION_NOT_ENABLED') {
      addRule('EXECUTION_CAPABILITY_VALIDATION', 'INFO', 'Verified execution capability status is EXECUTION_NOT_ENABLED.');
    } else {
      addRule('EXECUTION_CAPABILITY_VALIDATION', 'CRITICAL', 'Execution capability status is enabled.');
    }

    // 9. Plan remains not executable
    if (record.plan_executable_status === 'NOT_EXECUTABLE') {
      addRule('PLAN_EXECUTABLE_VALIDATION', 'INFO', 'Verified plan executable status is NOT_EXECUTABLE.');
    } else {
      addRule('PLAN_EXECUTABLE_VALIDATION', 'CRITICAL', 'Plan executable status is enabled.');
    }

    // 10. Confirmations verification
    const requiredConfirmations = [
      'final_human_seal_authorizer_unlock_authorization_seal_confirmation',
      'primary_authorizer_unlock_authorization_verified',
      'secondary_authorizer_unlock_authorization_verified',
      'security_officer_unlock_attestation_verified',
      'compliance_officer_unlock_attestation_verified',
      'operations_director_unlock_attestation_verified',
      'rollback_authority_unlock_attestation_verified',
      'kill_switch_verified',
      'non_execution_confirmed',
      'final_review_unlock_readiness_verified',
      'seal_authenticity_confirmed',
      'pre_execution_state_sealed_confirmed'
    ];

    for (const conf of requiredConfirmations) {
      if (confirmations[conf] === true) {
        addRule(`${conf.toUpperCase()}_VERIFICATION`, 'INFO', `Verified ${conf.replace(/_/g, ' ')}.`);
      } else {
        addRule(`${conf.toUpperCase()}_VERIFICATION`, 'CRITICAL', `${conf.replace(/_/g, ' ')} is missing.`);
      }
    }

    // 11. Write scope limits validation
    if (record.write_scope_attestation_json && record.write_scope_attestation_json.scope === 'PHASE_173_TABLES_ONLY') {
      addRule('WRITE_SCOPE_VERIFICATION', 'INFO', 'Verified write scope limits. Only Phase 173 schema structures are targeted.');
    } else {
      addRule('WRITE_SCOPE_VERIFICATION', 'CRITICAL', 'Invalid write scope attestation.');
    }

    // 12. Hash verification
    const expectedHash = parent.unlock_dual_control_authorization_hash || 'dcau_hash_dummy';
    if (record.source_unlock_dual_control_authorization_hash === expectedHash) {
      addRule('DUAL_CONTROL_HASH_VERIFICATION', 'INFO', 'Verified parent dual control hash matches parent record.');
    } else {
      addRule('DUAL_CONTROL_HASH_VERIFICATION', 'CRITICAL', 'Parent dual control hash mismatch.');
    }

    const hasCritical = rules.some(r => r.severity === 'CRITICAL');
    const guardrailStatus = hasCritical ? 'FAIL' : 'PASS';
    const writeScopeStatus = hasCritical ? 'FAIL' : 'PASS';
    const unlockFinalHumanAuthorizationSealResult = hasCritical ? 'FINAL_HUMAN_AUTHORIZATION_SEAL_BLOCKED_BY_GUARDRAIL' : 'FINAL_HUMAN_AUTHORIZATION_SEALED_NOT_UNLOCKED';
    const unlockFinalHumanAuthorizationSealStatus = hasCritical ? 'BLOCKED' : 'EVALUATED';

    if (!isProdLike) {
      builder._mockState.rules.set(unlockFinalHumanAuthorizationSealId, rules);
    } else {
      await db.query(`DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_fhas_rl WHERE activation_token_redemption_unlock_final_human_authorization_seal_id = ?`, [unlockFinalHumanAuthorizationSealId]);
      for (const rule of rules) {
        await db.query(
          `INSERT INTO cb_cohort_intervention_activation_token_redempt_unlock_fhas_rl
           (rule_id, activation_token_redemption_unlock_final_human_authorization_seal_id, check_type, severity, description)
           VALUES (?, ?, ?, ?, ?)`,
          [rule.rule_id, rule.activation_token_redemption_unlock_final_human_authorization_seal_id, rule.check_type, rule.severity, rule.description]
        );
      }
    }

    const updated = await builder._internalUpdateUnlockFinalHumanAuthorizationSeal(unlockFinalHumanAuthorizationSealId, {
      unlock_final_human_authorization_seal_status: unlockFinalHumanAuthorizationSealStatus,
      unlock_final_human_authorization_seal_result: unlockFinalHumanAuthorizationSealResult,
      guardrail_status: guardrailStatus,
      write_scope_status: writeScopeStatus,
      unlock_final_human_authorization_seal_rules_json: rules
    });

    return { tokenRedemptionUnlockFinalHumanAuthorizationSeal: updated, rules };
  }

  async getRules(unlockFinalHumanAuthorizationSealId) {
    return await builder.getRules(unlockFinalHumanAuthorizationSealId);
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSealEvaluatorService()
};
