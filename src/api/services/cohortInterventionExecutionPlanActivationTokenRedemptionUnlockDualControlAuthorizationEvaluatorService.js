'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const builder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorizationBuilderService').serviceInstance;
const operatorAttestationBuilder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockOperatorAttestationBuilderService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorizationEvaluatorService {
  async evaluateUnlockDualControlAuthorization(unlockDualControlAuthorizationId, confirmations, actorId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    const record = await builder.getTokenRedemptionUnlockDualControlAuthorization(unlockDualControlAuthorizationId);
    if (!record) throw new Error('UNLOCK_DUAL_CONTROL_AUTHORIZATION_RECORD_NOT_FOUND');

    let parent = null;
    if (!isProdLike) {
      parent = operatorAttestationBuilder._mockState.tokenRedemptionUnlockOperatorAttestation.get(record.source_act_token_redempt_unlock_operator_attestation_id);
    } else {
      const rows = await db.query(
        `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_oatt WHERE activation_token_redemption_unlock_operator_attestation_id = ?`,
        [record.source_act_token_redempt_unlock_operator_attestation_id]
      );
      if (rows && rows[0]) parent = rows[0];
    }

    if (!parent) {
      throw new Error(`UNLOCK_OPERATOR_ATTESTATION_NOT_FOUND: Parent attestation record not found.`);
    }

    const rules = [];
    const addRule = (checkType, severity, description) => {
      rules.push({
        rule_id: `rul_${crypto.randomBytes(8).toString('hex')}`,
        activation_token_redemption_unlock_dual_control_authorization_id: unlockDualControlAuthorizationId,
        check_type: checkType,
        severity,
        description,
        created_at: new Date()
      });
    };

    // 1. Parent Phase 171 finalized
    if (parent.unlock_operator_attestation_status === 'FINALIZED') {
      addRule('PHASE171_ATTESTATION_VALIDATION', 'INFO', 'Verified parent Phase 171 attestation is finalized.');
    } else {
      addRule('PHASE171_ATTESTATION_VALIDATION', 'CRITICAL', 'Parent Phase 171 attestation is not finalized.');
    }

    // 2. Parent Phase 171 result is OPERATOR_ATTESTED_NOT_UNLOCKED
    if (parent.unlock_operator_attestation_result === 'OPERATOR_ATTESTED_NOT_UNLOCKED') {
      addRule('PHASE171_RESULT_VALIDATION', 'INFO', 'Verified parent Phase 171 result is OPERATOR_ATTESTED_NOT_UNLOCKED.');
    } else {
      addRule('PHASE171_RESULT_VALIDATION', 'CRITICAL', 'Parent Phase 171 result is invalid.');
    }

    // 3. Dual Control identity checks
    if (!record.primary_authorizer_id) {
      addRule('PRIMARY_AUTHORIZER_MISSING', 'CRITICAL', 'Primary authorizer identity is missing.');
    }
    if (!record.secondary_authorizer_id) {
      addRule('SECONDARY_AUTHORIZER_MISSING', 'CRITICAL', 'Secondary authorizer identity is missing.');
    }
    if (record.primary_authorizer_id && record.secondary_authorizer_id) {
      if (record.primary_authorizer_id === record.secondary_authorizer_id) {
        addRule('DUAL_CONTROL_SAME_AUTHORIZER_FORBIDDEN', 'CRITICAL', 'Primary and secondary authorizers must be different individuals.');
      } else {
        addRule('DUAL_CONTROL_SEPARATION_VERIFIED', 'INFO', 'Dual control separation verified: authorizers are distinct.');
      }
    }

    // 4. Role validation
    const allowedRoles = ['operations_director', 'compliance_officer', 'security_officer', 'system_admin'];
    if (record.primary_authorizer_role && !allowedRoles.includes(record.primary_authorizer_role)) {
      addRule('PRIMARY_AUTHORIZER_ROLE_INVALID', 'CRITICAL', `Primary role '${record.primary_authorizer_role}' is not allowed.`);
    }
    if (record.secondary_authorizer_role && !allowedRoles.includes(record.secondary_authorizer_role)) {
      addRule('SECONDARY_AUTHORIZER_ROLE_INVALID', 'CRITICAL', `Secondary role '${record.secondary_authorizer_role}' is not allowed.`);
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
      'primary_authorizer_unlock_authorization_confirmation',
      'secondary_authorizer_unlock_authorization_confirmation',
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
    if (record.write_scope_attestation_json && record.write_scope_attestation_json.scope === 'PHASE_172_TABLES_ONLY') {
      addRule('WRITE_SCOPE_VERIFICATION', 'INFO', 'Verified write scope limits. Only Phase 172 schema structures are targeted.');
    } else {
      addRule('WRITE_SCOPE_VERIFICATION', 'CRITICAL', 'Invalid write scope attestation.');
    }

    // 12. Hash verification
    const expectedHash = parent.unlock_operator_attestation_hash || 'oatt_hash_dummy';
    if (record.source_unlock_operator_attestation_hash === expectedHash) {
      addRule('ATTESTATION_HASH_VERIFICATION', 'INFO', 'Verified parent attestation hash matches parent record.');
    } else {
      addRule('ATTESTATION_HASH_VERIFICATION', 'CRITICAL', 'Parent attestation hash mismatch.');
    }

    const hasCritical = rules.some(r => r.severity === 'CRITICAL');
    const guardrailStatus = hasCritical ? 'FAIL' : 'PASS';
    const writeScopeStatus = hasCritical ? 'FAIL' : 'PASS';
    const unlockDualControlAuthorizationResult = hasCritical ? 'DUAL_CONTROL_AUTHORIZATION_BLOCKED_BY_GUARDRAIL' : 'DUAL_CONTROL_AUTHORIZED_NOT_UNLOCKED';
    const unlockDualControlAuthorizationStatus = hasCritical ? 'BLOCKED' : 'EVALUATED';

    if (!isProdLike) {
      builder._mockState.rules.set(unlockDualControlAuthorizationId, rules);
    } else {
      await db.query(`DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_dcau_rl WHERE activation_token_redemption_unlock_dual_control_authorization_id = ?`, [unlockDualControlAuthorizationId]);
      for (const rule of rules) {
        await db.query(
          `INSERT INTO cb_cohort_intervention_activation_token_redempt_unlock_dcau_rl
           (rule_id, activation_token_redemption_unlock_dual_control_authorization_id, check_type, severity, description)
           VALUES (?, ?, ?, ?, ?)`,
          [rule.rule_id, rule.activation_token_redemption_unlock_dual_control_authorization_id, rule.check_type, rule.severity, rule.description]
        );
      }
    }

    const updated = await builder._internalUpdateUnlockDualControlAuthorization(unlockDualControlAuthorizationId, {
      unlock_dual_control_authorization_status: unlockDualControlAuthorizationStatus,
      unlock_dual_control_authorization_result: unlockDualControlAuthorizationResult,
      guardrail_status: guardrailStatus,
      write_scope_status: writeScopeStatus,
      unlock_dual_control_authorization_rules_json: rules
    });

    return { tokenRedemptionUnlockDualControlAuthorization: updated, rules };
  }

  async getRules(unlockDualControlAuthorizationId) {
    return await builder.getRules(unlockDualControlAuthorizationId);
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorizationEvaluatorService()
};
