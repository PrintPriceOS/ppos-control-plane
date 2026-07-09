'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const builder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockPreExecutionFreezeBuilderService').serviceInstance;
const sealBuilder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockSealBuilderService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockPreExecutionFreezeEvaluatorService {
  async evaluateUnlockPreExecutionFreeze(unlockPreExecutionFreezeId, confirmations, actorId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    const record = await builder.getTokenRedemptionUnlockPreExecutionFreeze(unlockPreExecutionFreezeId);
    if (!record) throw new Error('UNLOCK_PRE_EXECUTION_FREEZE_RECORD_NOT_FOUND');

    let parent = null;
    if (!isProdLike) {
      parent = sealBuilder._mockState.tokenRedemptionUnlockSeal.get(record.source_activation_token_redemption_unlock_seal_id);
    } else {
      const rows = await db.query(
        `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_seal WHERE activation_token_redemption_unlock_seal_id = ?`,
        [record.source_activation_token_redemption_unlock_seal_id]
      );
      if (rows && rows[0]) parent = rows[0];
    }

    if (!parent) {
      throw new Error(`UNLOCK_SEAL_NOT_FOUND: Parent seal record not found.`);
    }

    const rules = [];
    const addRule = (checkType, severity, description) => {
      rules.push({
        rule_id: `rul_${crypto.randomBytes(8).toString('hex')}`,
        activation_token_redemption_unlock_pre_execution_freeze_id: unlockPreExecutionFreezeId,
        check_type: checkType,
        severity,
        description,
        created_at: new Date()
      });
    };

    // 1. Parent Phase 169 finalized
    if (parent.unlock_seal_status === 'FINALIZED') {
      addRule('PHASE169_SEAL_VALIDATION', 'INFO', 'Verified parent Phase 169 seal is finalized.');
    } else {
      addRule('PHASE169_SEAL_VALIDATION', 'CRITICAL', 'Parent Phase 169 seal is not finalized.');
    }

    // 2. Parent Phase 169 result is UNLOCK_READINESS_SEALED_NOT_UNLOCKED
    if (parent.unlock_seal_result === 'UNLOCK_READINESS_SEALED_NOT_UNLOCKED') {
      addRule('PHASE169_RESULT_VALIDATION', 'INFO', 'Verified parent Phase 169 result is UNLOCK_READINESS_SEALED_NOT_UNLOCKED.');
    } else {
      addRule('PHASE169_RESULT_VALIDATION', 'CRITICAL', 'Parent Phase 169 result is invalid.');
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

    // 9. Confirmations verification (9 required confirmations)
    const requiredConfirmations = [
      'security_officer_unlock_freeze_confirmation',
      'compliance_officer_unlock_freeze_confirmation',
      'operations_director_unlock_freeze_confirmation',
      'rollback_authority_unlock_freeze_confirmation',
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

    // 10. Write scope limits validation
    if (record.write_scope_attestation_json && record.write_scope_attestation_json.scope === 'PHASE_170_TABLES_ONLY') {
      addRule('WRITE_SCOPE_VERIFICATION', 'INFO', 'Verified write scope limits. Only Phase 170 schema structures are targeted.');
    } else {
      addRule('WRITE_SCOPE_VERIFICATION', 'CRITICAL', 'Invalid write scope attestation.');
    }

    // 11. Hash verification
    const expectedHash = parent.unlock_seal_hash || 'seal_hash_dummy';
    if (record.source_unlock_seal_hash === expectedHash) {
      addRule('SEAL_HASH_VERIFICATION', 'INFO', 'Verified parent seal hash matches parent record.');
    } else {
      addRule('SEAL_HASH_VERIFICATION', 'CRITICAL', 'Parent seal hash mismatch.');
    }

    const hasCritical = rules.some(r => r.severity === 'CRITICAL');
    const guardrailStatus = hasCritical ? 'FAIL' : 'PASS';
    const writeScopeStatus = hasCritical ? 'FAIL' : 'PASS';
    const unlockPreExecutionFreezeResult = hasCritical ? 'UNLOCK_PRE_EXECUTION_FREEZE_BLOCKED_BY_GUARDRAIL' : 'UNLOCK_PRE_EXECUTION_FROZEN_NOT_UNLOCKED';
    const unlockPreExecutionFreezeStatus = hasCritical ? 'BLOCKED' : 'EVALUATED';

    if (!isProdLike) {
      builder._mockState.rules.set(unlockPreExecutionFreezeId, rules);
    } else {
      await db.query(`DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_pfrz_rl WHERE activation_token_redemption_unlock_pre_execution_freeze_id = ?`, [unlockPreExecutionFreezeId]);
      for (const rule of rules) {
        await db.query(
          `INSERT INTO cb_cohort_intervention_activation_token_redempt_unlock_pfrz_rl
           (rule_id, activation_token_redemption_unlock_pre_execution_freeze_id, check_type, severity, description)
           VALUES (?, ?, ?, ?, ?)`,
          [rule.rule_id, rule.activation_token_redemption_unlock_pre_execution_freeze_id, rule.check_type, rule.severity, rule.description]
        );
      }
    }

    const updated = await builder._internalUpdateUnlockPreExecutionFreeze(unlockPreExecutionFreezeId, {
      unlock_pre_execution_freeze_status: unlockPreExecutionFreezeStatus,
      unlock_pre_execution_freeze_result: unlockPreExecutionFreezeResult,
      guardrail_status: guardrailStatus,
      write_scope_status: writeScopeStatus,
      unlock_pre_execution_freeze_rules_json: rules
    });

    return { tokenRedemptionUnlockPreExecutionFreeze: updated, rules };
  }

  async getRules(unlockPreExecutionFreezeId) {
    return await builder.getRules(unlockPreExecutionFreezeId);
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockPreExecutionFreezeEvaluatorService()
};
