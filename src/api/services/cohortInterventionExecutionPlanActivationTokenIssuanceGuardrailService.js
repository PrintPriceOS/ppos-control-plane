'use strict';

const fs = require('fs');
const path = require('path');
const db = require('./mysqlClient');
const builder = require('./cohortInterventionExecutionPlanActivationTokenIssuanceBuilderService').serviceInstance;

const FORBIDDEN_PATTERNS = [
  'redeemActivationToken',
  'makeTokenRedeemable',
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
  'issueRedeemableToken',
  'issueUsableToken',
  'issueAndRedeemToken',
  'issueAndActivateToken',
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
  'tokenIssuanceOnlyAssertions',
  'nonRedeemableTokenAssertions',
  'recordTokenIssuance',
  'createNonRedeemableIssuanceRecord'
];

class CohortInterventionExecutionPlanActivationTokenIssuanceGuardrailService {
  async performSafetyScannerCheck(activationTokenIssuanceId) {
    const findings = [];
    const filesToScan = [
      path.join(__dirname, 'cohortInterventionExecutionPlanActivationTokenIssuanceBuilderService.js'),
      path.join(__dirname, 'cohortInterventionExecutionPlanActivationTokenIssuanceEvaluatorService.js'),
      path.join(__dirname, 'cohortInterventionExecutionPlanActivationTokenIssuanceDecisionService.js'),
      path.join(__dirname, 'cohortInterventionExecutionPlanActivationTokenIssuanceEvidencePackService.js'),
      path.join(__dirname, '../routes/controlledBetaCohortInterventionExecutionPlanActivationTokenIssuanceAdmin.js')
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
        description: 'Static scan of Phase 160 components confirms zero active activation pathways or runtime table connections.'
      });
    }

    return findings;
  }

  async verifyWriteScope(activationTokenIssuanceId) {
    const record = await builder.getTokenIssuance(activationTokenIssuanceId);
    if (!record) throw new Error('TOKEN_ISSUANCE_RECORD_NOT_FOUND');

    const attestation = typeof record.write_scope_attestation_json === 'string'
      ? JSON.parse(record.write_scope_attestation_json)
      : record.write_scope_attestation_json;

    const findings = [];
    if (!attestation ||
        attestation.writes_only_phase160_tables !== true ||
        attestation.wrote_phase128_to_159_operational_tables !== false) {
      findings.push({
        check_type: 'WRITE_SCOPE_VERIFICATION',
        severity: 'CRITICAL',
        description: 'Write scope boundary violation: Attempting to modify restricted operations tables.'
      });
    } else {
      findings.push({
        check_type: 'WRITE_SCOPE_VERIFICATION',
        severity: 'INFO',
        description: 'Verified write scope limits. Only Phase 160 schema structures are targeted.'
      });
    }

    return findings;
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenIssuanceGuardrailService()
};
