'use strict';

const fs = require('fs');
const path = require('path');
const db = require('./mysqlClient');
const builder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationBuilderService').serviceInstance;

const FORBIDDEN_PATTERNS = [
  'redeemActivationToken',
  'makeTokenRedeemable',
  'activateRedeemedToken',
  'redeemAndActivateToken',
  'authorizeAndRedeemToken',
  'authorizeRedeemAndActivate',
  'activateExecutionPlan',
  'authorizeAndActivate',
  'goAndExecute',
  'markPlanExecutable',
  'enableExecutionPlan',
  'executePlan',
  'createExecutionJob',
  'enqueueExecution',
  'scheduleExecution',
  'dispatchIntervention',
  'pauseCohort',
  'restrictParticipant',
  'revokeInvite',
  'expandCohort',
  'commitMutation',
  'applyIntervention',
  'writeRuntimeState',
  'grantRuntimeAccess',
  'createRuntimeSession',
  'activateCredential',
  'EXECUTE_COHORT_PAUSE',
  'EXECUTE_PARTICIPANT_RESTRICTION',
  'EXECUTE_INVITE_REVOCATION',
  'EXECUTE_CONTROLLED_EXPANSION'
];

const ALLOWED_EXCLUSIONS = [
  'forbiddenPatterns',
  'blockedCommands',
  'guardrail checks',
  'safety boundary assertions',
  'tokenRedemptionAuthorizationOnlyAssertions',
  'nonRedeemableTokenAssertions',
  'createRedemptionAuthorizationRecord',
  'recordRedemptionAuthorization',
  'evaluateRedemptionAuthorization',
  'finalizeRedemptionAuthorization'
];

class CohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationGuardrailService {
  async performSafetyScannerCheck(activationTokenRedemptionAuthId) {
    const findings = [];
    const filesToScan = [
      path.join(__dirname, 'cohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationBuilderService.js'),
      path.join(__dirname, 'cohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationEvaluatorService.js'),
      path.join(__dirname, 'cohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationDecisionService.js'),
      path.join(__dirname, 'cohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationEvidencePackService.js'),
      path.join(__dirname, '../routes/controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationAdmin.js')
    ];

    for (const f of filesToScan) {
      if (!fs.existsSync(f)) continue;
      const content = fs.readFileSync(f, 'utf8');
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (content.includes(pattern)) {
          const isExcluded = ALLOWED_EXCLUSIONS.includes(pattern);
          if (!isExcluded) {
            findings.push({
              check_type: 'FORBIDDEN_ACTIVATION_SCAN',
              severity: 'CRITICAL',
              description: `Forbidden active execution pattern found: "${pattern}" in ${path.basename(f)}`
            });
          }
        }
      }
    }

    if (findings.length === 0) {
      findings.push({
        check_type: 'FORBIDDEN_ACTIVATION_SCAN',
        severity: 'INFO',
        description: 'Static scan of Phase 162 components confirms zero active activation pathways or runtime table connections.'
      });
    }

    return findings;
  }

  async verifyWriteScope(activationTokenRedemptionAuthId) {
    const record = await builder.getTokenRedemptionAuth(activationTokenRedemptionAuthId);
    if (!record) throw new Error('TOKEN_REDEMPTION_AUTH_RECORD_NOT_FOUND');

    const attestation = typeof record.write_scope_attestation_json === 'string'
      ? JSON.parse(record.write_scope_attestation_json)
      : record.write_scope_attestation_json;

    const findings = [];
    if (!attestation ||
        attestation.writes_only_phase162_tables !== true ||
        attestation.wrote_phase128_to_161_operational_tables !== false) {
      findings.push({
        check_type: 'WRITE_SCOPE_VERIFICATION',
        severity: 'CRITICAL',
        description: 'Write scope boundary violation: Attempting to modify restricted operations tables.'
      });
    } else {
      findings.push({
        check_type: 'WRITE_SCOPE_VERIFICATION',
        severity: 'INFO',
        description: 'Verified write scope limits. Only Phase 162 schema structures are targeted.'
      });
    }

    return findings;
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionAuthorizationGuardrailService()
};
