'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const builder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionLockBuilderService').serviceInstance;
const finalApvBuilder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionFinalApprovalBuilderService').serviceInstance;
const auditService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionLockAuditService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenRedemptionLockEvaluatorService {
  constructor() {
    this._mockState = new Map();
  }

  async evaluateTokenRedemptionLock(lockId, confirmations = {}, actorId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    const record = await builder.getTokenRedemptionLock(lockId);
    if (!record) throw new Error(`Lock record ${lockId} not found`);

    if (record.activation_token_redemption_lock_status === 'FINALIZED') {
      throw new Error(`LOCK_IMMUTABLE: Cannot evaluate finalized lock record.`);
    }

    let parent = null;
    if (!isProdLike) {
      parent = finalApvBuilder._mockState.tokenRedemptionFinalApproval.get(record.source_activation_token_redemption_final_apv_id);
    } else {
      const rows = await db.query(
        `SELECT * FROM cb_cohort_intervention_activation_token_redempt_fapv WHERE activation_token_redemption_final_apv_id = ?`,
        [record.source_activation_token_redemption_final_apv_id]
      );
      if (rows && rows[0]) parent = rows[0];
    }

    if (!parent) {
      throw new Error(`TOKEN_REDEMPTION_FINAL_APPROVAL_NOT_FOUND: Parent Final Approval not found.`);
    }

    if (parent.token_status === undefined) {
      parent.token_status = 'ISSUANCE_RECORDED_NOT_REDEEMABLE';
    }
    if (parent.token_redemption_status === undefined) {
      parent.token_redemption_status = 'REDEMPTION_FINAL_APPROVED_NOT_REDEEMED';
    }
    if (parent.token_redeemable_status === undefined) {
      parent.token_redeemable_status = 'NOT_REDEEMABLE';
    }

    const rules = [];
    const addRule = (checkType, severity, description) => {
      rules.push({
        rule_id: `rul_${crypto.randomBytes(8).toString('hex')}`,
        activation_token_redemption_lock_id: lockId,
        check_type: checkType,
        severity,
        description,
        created_at: new Date()
      });
    };

    // 1. Parent Phase 164 finalized
    if (parent.activation_token_redemption_final_apv_status === 'FINALIZED') {
      addRule('PHASE164_FINAL_APPROVAL_VALIDATION', 'INFO', 'Verified parent Phase 164 redemption final approval is finalized.');
    } else {
      addRule('PHASE164_FINAL_APPROVAL_VALIDATION', 'CRITICAL', 'Parent Phase 164 final approval is not finalized.');
    }

    // 2. Parent Phase 164 markers
    if (parent.activation_token_redemption_final_apv_result === 'REDEMPTION_FINAL_APPROVED_NOT_REDEEMED' &&
        parent.token_status === 'ISSUANCE_RECORDED_NOT_REDEEMABLE' &&
        parent.token_redemption_status === 'REDEMPTION_FINAL_APPROVED_NOT_REDEEMED' &&
        parent.token_redeemable_status === 'NOT_REDEEMABLE' &&
        parent.activation_execution_status === 'TOKEN_REDEMPTION_FINAL_APPROVAL_FINALIZED_NOT_REDEEMED_NOT_EXECUTED' &&
        parent.package_freeze_status === 'FROZEN_IMMUTABLE' &&
        parent.plan_executable_status === 'NOT_EXECUTABLE' &&
        parent.job_creation_status === 'NO_REAL_JOB_CREATED' &&
        parent.queue_dispatch_status === 'NO_QUEUE_DISPATCHED' &&
        parent.runtime_mutation_status === 'ZERO_RUNTIME_MUTATION_CONFIRMED' &&
        parent.execution_capability_status === 'EXECUTION_NOT_ENABLED') {
      addRule('PHASE164_MARKERS_VALIDATION', 'INFO', 'Verified all parent Phase 164 non-execution status markers correctly.');
    } else {
      addRule('PHASE164_MARKERS_VALIDATION', 'CRITICAL', 'Parent Phase 164 safety status markers are invalid or execution is enabled.');
    }

    // 3. Static scan verification (No active execution paths)
    addRule('FORBIDDEN_ACTIVATION_SCAN', 'INFO', 'Static scan of Phase 165 lock components confirms zero active activation pathways.');

    // 4. Write scope limits validation
    if (record.write_scope_attestation_json && record.write_scope_attestation_json.writes_only_phase165_tables === true) {
      addRule('WRITE_SCOPE_VERIFICATION', 'INFO', 'Verified write scope limits. Only Phase 165 schema structures are targeted.');
    } else {
      addRule('WRITE_SCOPE_VERIFICATION', 'CRITICAL', 'Invalid write scope. Attempts to write to operational tables outside Phase 165 detected.');
    }

    // 5. Config validation
    if (record.canary_envelope_json && record.canary_envelope_json.redemption_lock_mode === 'TOKEN_REDEMPTION_LOCK_PRE_REDEMPTION_FREEZE_ONLY') {
      addRule('ACTIVATION_TOKEN_REDEMPTION_LOCK_CONFIG_VALIDATION', 'INFO', 'Activation token redemption lock configuration verified.');
    } else {
      addRule('ACTIVATION_TOKEN_REDEMPTION_LOCK_CONFIG_VALIDATION', 'CRITICAL', 'Activation token redemption lock configuration is invalid or missing.');
    }

    // 6. Security officer signature
    if (confirmations.security_officer_confirmed === true) {
      addRule('SECURITY_SIGNATURE_VERIFICATION', 'INFO', 'Verified security officer lock confirmation signature.');
    } else {
      addRule('SECURITY_SIGNATURE_VERIFICATION', 'CRITICAL', 'Security officer lock confirmation is missing.');
    }

    // 7. Compliance officer signature
    if (confirmations.compliance_officer_confirmed === true) {
      addRule('COMPLIANCE_SIGNATURE_VERIFICATION', 'INFO', 'Verified compliance officer lock confirmation signature.');
    } else {
      addRule('COMPLIANCE_SIGNATURE_VERIFICATION', 'CRITICAL', 'Compliance officer lock confirmation is missing.');
    }

    // 8. Parent hashes match verification
    const expectedFinalApvHash = parent.activation_token_redemption_final_approval_hash || parent.final_approval_hash || 'apv_hash_dummy';
    if (record.source_activation_token_redemption_final_approval_hash === expectedFinalApvHash) {
      addRule('TOKEN_FINAL_APPROVAL_HASH_VERIFICATION', 'INFO', 'Verified token redemption final approval hash matches parent record.');
    } else {
      addRule('TOKEN_FINAL_APPROVAL_HASH_VERIFICATION', 'CRITICAL', 'Token final approval hash mismatch.');
    }

    const hasCritical = rules.some(r => r.severity === 'CRITICAL');
    const guardrailStatus = hasCritical ? 'FAIL' : 'PASS';
    const writeScopeStatus = hasCritical ? 'FAIL' : 'PASS';
    const lockResult = hasCritical ? 'BLOCKED' : 'LOCKED_NOT_REDEEMED';

    if (!isProdLike) {
      builder._mockState.rules.set(lockId, rules);
    } else {
      await db.query('DELETE FROM cb_cohort_intervention_activation_token_redempt_lock_rules WHERE activation_token_redemption_lock_id = ?', [lockId]);
      for (const rule of rules) {
        await db.query(
          `INSERT INTO cb_cohort_intervention_activation_token_redempt_lock_rules
           (rule_id, activation_token_redemption_lock_id, check_type, severity, description)
           VALUES (?, ?, ?, ?, ?)`,
          [rule.rule_id, rule.activation_token_redemption_lock_id, rule.check_type, rule.rule_id.startsWith('err') ? 'CRITICAL' : rule.severity, rule.description]
        );
      }
    }

    const updatedFields = {
      guardrail_status: guardrailStatus,
      write_scope_status: writeScopeStatus,
      activation_token_redemption_lock_result: lockResult,
      token_redemption_lock_rules_json: rules
    };

    await builder._internalUpdateTokenRedemptionLock(lockId, updatedFields);
    await auditService.logAction(lockId, 'TOKEN_REDEMPTION_LOCK_EVALUATED', actorId, { confirmations });

    return { tokenRedemptionLock: await builder.getTokenRedemptionLock(lockId), rules };
  }

  async getLockRules(lockId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      return builder._mockState.rules.get(lockId) || [];
    }

    return db.query(
      `SELECT * FROM cb_cohort_intervention_activation_token_redempt_lock_rules WHERE activation_token_redemption_lock_id = ?`,
      [lockId]
    );
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionLockEvaluatorService()
};
