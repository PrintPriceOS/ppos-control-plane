'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const builder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockComplianceWitnessBuilderService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockComplianceWitnessEvaluatorService {
  async evaluateUnlockComplianceWitness(unlockComplianceWitnessId, confirmations, actorId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    const record = await builder.getTokenRedemptionUnlockComplianceWitness(unlockComplianceWitnessId);
    if (!record) {
      throw new Error(`Compliance witness record ${unlockComplianceWitnessId} not found.`);
    }

    if (record.unlock_compliance_witness_status === 'FINALIZED') {
      throw new Error(`Compliance witness record ${unlockComplianceWitnessId} is finalized and cannot be re-evaluated.`);
    }

    const rules = [];
    const addRule = (checkType, severity, description) => {
      rules.push({
        rule_id: `rul_${crypto.randomBytes(8).toString('hex')}`,
        act_token_redempt_unlock_compliance_witness_id: unlockComplianceWitnessId,
        check_type: checkType,
        severity,
        description,
        created_at: new Date()
      });
    };

    // 1. Parent finalized
    if (record.unlock_final_human_authorization_seal_status === 'FINALIZED') {
      addRule('PHASE173_FINAL_HUMAN_SEAL_VALIDATION', 'INFO', 'Verified parent Phase 173 final human authorization seal is finalized.');
    } else {
      addRule('PHASE173_FINAL_HUMAN_SEAL_VALIDATION', 'CRITICAL', 'Parent Phase 173 final human authorization seal is not finalized.');
    }

    // 2. Token unlock state
    if (record.token_unlock_status === 'NOT_UNLOCKED') {
      addRule('TOKEN_UNLOCK_STATUS_CHECK', 'INFO', 'Verified token remains in NOT_UNLOCKED state.');
    } else {
      addRule('TOKEN_UNLOCK_STATUS_CHECK', 'CRITICAL', 'Token unlock status check failed: token is unlocked.');
    }

    // 3. Token redeemable state
    if (record.token_redeemable_status === 'NOT_REDEEMABLE') {
      addRule('TOKEN_REDEEMABLE_STATUS_CHECK', 'INFO', 'Verified token remains in NOT_REDEEMABLE state.');
    } else {
      addRule('TOKEN_REDEEMABLE_STATUS_CHECK', 'CRITICAL', 'Token redeemable status check failed: token is redeemable.');
    }

    // 4. Token redemption lock state
    if (record.token_redemption_lock_status === 'LOCKED_NOT_REDEEMED') {
      addRule('TOKEN_REDEMPTION_LOCK_CHECK', 'INFO', 'Verified token redemption lock remains LOCKED_NOT_REDEEMED.');
    } else {
      addRule('TOKEN_REDEMPTION_LOCK_CHECK', 'CRITICAL', 'Token redemption lock state check failed.');
    }

    // 5. Execution capability state
    if (record.execution_capability_status === 'EXECUTION_NOT_ENABLED') {
      addRule('EXECUTION_CAPABILITY_CHECK', 'INFO', 'Verified execution capability remains EXECUTION_NOT_ENABLED.');
    } else {
      addRule('EXECUTION_CAPABILITY_CHECK', 'CRITICAL', 'Execution capability check failed: execution is enabled.');
    }

    // 6. Plan executable state
    if (record.plan_executable_status === 'NOT_EXECUTABLE') {
      addRule('PLAN_EXECUTABLE_CHECK', 'INFO', 'Verified plan remains in NOT_EXECUTABLE state.');
    } else {
      addRule('PLAN_EXECUTABLE_CHECK', 'CRITICAL', 'Plan executable status check failed: plan is executable.');
    }

    // 7. Job creation state
    if (record.job_creation_status === 'NO_REAL_JOB_CREATED') {
      addRule('JOB_CREATION_CHECK', 'INFO', 'Verified zero real jobs created.');
    } else {
      addRule('JOB_CREATION_CHECK', 'CRITICAL', 'Job creation check failed: real jobs were created.');
    }

    // 8. Queue dispatch state
    if (record.queue_dispatch_status === 'NO_QUEUE_DISPATCHED') {
      addRule('QUEUE_DISPATCH_CHECK', 'INFO', 'Verified zero queues dispatched.');
    } else {
      addRule('QUEUE_DISPATCH_CHECK', 'CRITICAL', 'Queue dispatch check failed: queues were dispatched.');
    }

    // 9. Runtime mutation state
    if (record.runtime_mutation_status === 'ZERO_RUNTIME_MUTATION_CONFIRMED') {
      addRule('RUNTIME_MUTATION_CHECK', 'INFO', 'Verified zero runtime mutations confirmed.');
    } else {
      addRule('RUNTIME_MUTATION_CHECK', 'CRITICAL', 'Runtime mutation check failed.');
    }

    // 10. Write scope bounds
    if (record.write_scope_status === 'PASSED' || record.write_scope_status === 'PASS') {
      addRule('WRITE_SCOPE_BOUNDS_CHECK', 'INFO', 'Verified database writes are bounded to Phase 174 tables only.');
    } else {
      addRule('WRITE_SCOPE_BOUNDS_CHECK', 'CRITICAL', 'Write scope bounds check failed.');
    }

    // Evaluate the 13 confirmations
    const checkConfirmation = (key, label) => {
      if (confirmations && confirmations[key] === true) {
        addRule(label, 'INFO', `Verified confirmation: ${key}`);
      } else {
        addRule(label, 'CRITICAL', `Missing required confirmation: ${key}`);
      }
    };

    checkConfirmation('compliance_witness_attestation_confirmation', 'COMPLIANCE_WITNESS_CONFIRMATION');
    checkConfirmation('final_human_seal_authorizer_unlock_seal_verified', 'FINAL_HUMAN_SEAL_CONFIRMATION');
    checkConfirmation('primary_authorizer_unlock_authorization_verified', 'PRIMARY_AUTH_CONFIRMATION');
    checkConfirmation('secondary_authorizer_unlock_authorization_verified', 'SECONDARY_AUTH_CONFIRMATION');
    checkConfirmation('security_officer_unlock_attestation_verified', 'SECURITY_OFFICER_CONFIRMATION');
    checkConfirmation('compliance_officer_unlock_attestation_verified', 'COMPLIANCE_OFFICER_CONFIRMATION');
    checkConfirmation('operations_director_unlock_attestation_verified', 'OPERATIONS_DIRECTOR_CONFIRMATION');
    checkConfirmation('rollback_authority_unlock_attestation_verified', 'ROLLBACK_AUTHORITY_CONFIRMATION');
    checkConfirmation('kill_switch_verified', 'KILL_SWITCH_CONFIRMATION');
    checkConfirmation('non_execution_confirmed', 'NON_EXECUTION_CONFIRMATION');
    checkConfirmation('final_review_unlock_readiness_verified', 'FINAL_REVIEW_CONFIRMATION');
    checkConfirmation('seal_authenticity_confirmed', 'SEAL_AUTHENTICITY_CONFIRMATION');
    checkConfirmation('pre_execution_state_sealed_confirmed', 'PRE_EXEC_SEAL_CONFIRMATION');

    const hasCritical = rules.some(r => r.severity === 'CRITICAL');
    const unlockComplianceWitnessStatus = 'EVALUATED';
    const unlockComplianceWitnessResult = hasCritical ? 'COMPLIANCE_WITNESS_FAILED' : 'COMPLIANCE_WITNESSED_NOT_UNLOCKED';

    if (!isProdLike) {
      builder._mockState.rules.set(unlockComplianceWitnessId, rules);
    } else {
      await db.query(`DELETE FROM cb_cohort_intervention_activation_token_redempt_unlock_cwn_rl WHERE act_token_redempt_unlock_compliance_witness_id = ?`, [unlockComplianceWitnessId]);
      for (const rule of rules) {
        await db.query(
          `INSERT INTO cb_cohort_intervention_activation_token_redempt_unlock_cwn_rl
           (rule_id, act_token_redempt_unlock_compliance_witness_id, check_type, severity, description)
           VALUES (?, ?, ?, ?, ?)`,
          [rule.rule_id, rule.act_token_redempt_unlock_compliance_witness_id, rule.check_type, rule.severity, rule.description]
        );
      }
    }

    const updated = await builder._internalUpdateUnlockComplianceWitness(unlockComplianceWitnessId, {
      unlock_compliance_witness_status: unlockComplianceWitnessStatus,
      unlock_compliance_witness_result: unlockComplianceWitnessResult,
      unlock_compliance_witness_rules_json: rules
    });

    return {
      tokenRedemptionUnlockComplianceWitness: updated,
      rules
    };
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockComplianceWitnessEvaluatorService()
};
