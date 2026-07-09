'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const builder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockOperatorAttestationBuilderService').serviceInstance;
const freezeBuilder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockPreExecutionFreezeBuilderService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockOperatorAttestationEvaluatorService {
  async evaluateUnlockOperatorAttestation(unlockOperatorAttestationId, confirmations, actorId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    const record = await builder.getTokenRedemptionUnlockOperatorAttestation(unlockOperatorAttestationId);
    if (!record) throw new Error('UNLOCK_OPERATOR_ATTESTATION_RECORD_NOT_FOUND');

    let parent = null;
    if (!isProdLike) {
      parent = freezeBuilder._mockState.tokenRedemptionUnlockPreExecutionFreeze.get(record.source_act_token_redempt_unlock_pre_execution_freeze_id);
    } else {
      const rows = await db.query(
        `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_pfrz WHERE activation_token_redemption_unlock_pre_execution_freeze_id = ?`,
        [record.source_act_token_redempt_unlock_pre_execution_freeze_id]
      );
      if (rows && rows[0]) parent = rows[0];
    }

    if (!parent) {
      throw new Error(`UNLOCK_PRE_EXECUTION_FREEZE_NOT_FOUND: Parent freeze record not found.`);
    }

    const rules = [];
    const addRule = (checkType, severity, description) => {
      rules.push({
        rule_id: `rul_${crypto.randomBytes(8).toString('hex')}`,
        activation_token_redemption_unlock_operator_attestation_id: unlockOperatorAttestationId,
        check_type: checkType,
        severity,
        description,
        created_at: new Date()
      });
    };

    // 1. Parent Phase 170 finalized
    if (parent.unlock_pre_execution_freeze_status === 'FINALIZED') {
      addRule('PHASE170_FREEZE_VALIDATION', 'INFO', 'Verified parent Phase 170 freeze is finalized.');
    } else {
      addRule('PHASE170_FREEZE_VALIDATION', 'CRITICAL', 'Parent Phase 170 freeze is not finalized.');
    }

    // 2. Parent Phase 170 result is UNLOCK_PRE_EXECUTION_FROZEN_NOT_UNLOCKED
    if (parent.unlock_pre_execution_freeze_result === 'UNLOCK_PRE_EXECUTION_FROZEN_NOT_UNLOCKED') {
      addRule('PHASE170_RESULT_VALIDATION', 'INFO', 'Verified parent Phase 170 result is UNLOCK_PRE_EXECUTION_FROZEN_NOT_UNLOCKED.');
    } else {
      addRule('PHASE170_RESULT_VALIDATION', 'CRITICAL', 'Parent Phase 170 result is invalid.');
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

    // 9. Confirmations verification (10 required confirmations)
    const requiredConfirmations = [
      'security_officer_unlock_attestation_confirmation',
      'compliance_officer_unlock_attestation_confirmation',
      'operations_director_unlock_attestation_confirmation',
      'rollback_authority_unlock_attestation_confirmation',
      'kill_switch_verified',
      'non_execution_confirmed',
      'final_review_unlock_readiness_verified',
      'seal_authenticity_confirmed',
      'pre_execution_state_sealed_confirmed',
      'operator_attestation_confirmed'
    ];

    for (const conf of requiredConfirmations) {
      if (confirmations[conf] === true) {
        addRule(`${conf.toUpperCase()}_VERIFICATION`, 'INFO', `Verified ${conf.replace(/_/g, ' ')}.`);
      } else {
        addRule(`${conf.toUpperCase()}_VERIFICATION`, 'CRITICAL', `${conf.replace(/_/g, ' ')} is missing.`);
      }
    }

    // 10. Write scope limits validation
    if (record.write_scope_attestation_json && record.write_scope_attestation_json.scope === 'PHASE_171_TABLES_ONLY') {
      addRule('WRITE_SCOPE_VERIFICATION', 'INFO', 'Verified write scope limits. Only Phase 171 schema structures are targeted.');
    } else {
      addRule('WRITE_SCOPE_VERIFICATION', 'CRITICAL', 'Invalid write scope attestation.');
    }

    // 11. Hash verification
    const expectedHash = parent.unlock_pre_execution_freeze_hash || 'pfrz_hash_dummy';
    if (record.source_unlock_pre_execution_freeze_hash === expectedHash) {
      addRule('FREEZE_HASH_VERIFICATION', 'INFO', 'Verified parent freeze hash matches parent record.');
    } else {
      addRule('FREEZE_HASH_VERIFICATION', 'CRITICAL', 'Parent freeze hash mismatch.');
    }

    const hasCritical = rules.some(r => r.severity === 'CRITICAL');
    const guardrailStatus = hasCritical ? 'FAIL' : 'PASS';
    const writeScopeStatus = hasCritical ? 'FAIL' : 'PASS';
    const unlockOperatorAttestationResult = hasCritical ? 'OPERATOR_ATTESTATION_BLOCKED_BY_GUARDRAIL' : 'OPERATOR_ATTESTED_NOT_UNLOCKED';
    const unlockOperatorAttestationStatus = hasCritical ? 'BLOCKED' : 'EVALUATED';

    if (!isProdLike) {
      builder._mockState.rules.set(unlockOperatorAttestationId, rules);
    } else {
      await db.query(`DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_oatt_rl WHERE activation_token_redemption_unlock_operator_attestation_id = ?`, [unlockOperatorAttestationId]);
      for (const rule of rules) {
        await db.query(
          `INSERT INTO cb_cohort_intervention_activation_token_redempt_unlock_oatt_rl
           (rule_id, activation_token_redemption_unlock_operator_attestation_id, check_type, severity, description)
           VALUES (?, ?, ?, ?, ?)`,
          [rule.rule_id, rule.activation_token_redemption_unlock_operator_attestation_id, rule.check_type, rule.severity, rule.description]
        );
      }
    }

    const updated = await builder._internalUpdateUnlockOperatorAttestation(unlockOperatorAttestationId, {
      unlock_operator_attestation_status: unlockOperatorAttestationStatus,
      unlock_operator_attestation_result: unlockOperatorAttestationResult,
      guardrail_status: guardrailStatus,
      write_scope_status: writeScopeStatus,
      unlock_operator_attestation_rules_json: rules
    });

    return { tokenRedemptionUnlockOperatorAttestation: updated, rules };
  }

  async getRules(unlockOperatorAttestationId) {
    return await builder.getRules(unlockOperatorAttestationId);
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockOperatorAttestationEvaluatorService()
};
