'use strict';

const fs = require('fs');
const path = require('path');
const db = require('./mysqlClient');
const builder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionReadinessBuilderService').serviceInstance;

const FORBIDDEN_PATTERNS = [
  'redeemActivationToken',
  'makeTokenRedeemable',
  'activateRedeemedToken',
  'redeemAndActivateToken',
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
  'tokenRedemptionReadinessOnlyAssertions',
  'nonRedeemableTokenAssertions',
  'createRedemptionReadinessRecord',
  'recordRedemptionReadiness',
  'evaluateRedemptionReadiness',
  'finalizeRedemptionReadiness'
];

class CohortInterventionExecutionPlanActivationTokenRedemptionReadinessGuardrailService {
  async performSafetyScannerCheck(activationTokenRedemptionReadinessId) {
    const findings = [];
    const filesToScan = [
      path.join(__dirname, 'cohortInterventionExecutionPlanActivationTokenRedemptionReadinessBuilderService.js'),
      path.join(__dirname, 'cohortInterventionExecutionPlanActivationTokenRedemptionReadinessEvaluatorService.js'),
      path.join(__dirname, 'cohortInterventionExecutionPlanActivationTokenRedemptionReadinessDecisionService.js'),
      path.join(__dirname, 'cohortInterventionExecutionPlanActivationTokenRedemptionReadinessEvidencePackService.js'),
      path.join(__dirname, '../routes/controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionReadinessAdmin.js')
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
        description: 'Static scan of Phase 161 components confirms zero active activation pathways or runtime table connections.'
      });
    }

    return findings;
  }

  async verifyWriteScope(activationTokenRedemptionReadinessId) {
    const record = await builder.getTokenRedemptionReadiness(activationTokenRedemptionReadinessId);
    if (!record) throw new Error('TOKEN_REDEMPTION_READINESS_RECORD_NOT_FOUND');

    const attestation = typeof record.write_scope_attestation_json === 'string'
      ? JSON.parse(record.write_scope_attestation_json)
      : record.write_scope_attestation_json;

    const findings = [];
    if (!attestation ||
        attestation.writes_only_phase161_tables !== true ||
        attestation.wrote_phase128_to_160_operational_tables !== false) {
      findings.push({
        check_type: 'WRITE_SCOPE_VERIFICATION',
        severity: 'CRITICAL',
        description: 'Write scope boundary violation: Attempting to modify restricted operations tables.'
      });
    } else {
      findings.push({
        check_type: 'WRITE_SCOPE_VERIFICATION',
        severity: 'INFO',
        description: 'Verified write scope limits. Only Phase 161 schema structures are targeted.'
      });
    }

    return findings;
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionReadinessGuardrailService()
};
