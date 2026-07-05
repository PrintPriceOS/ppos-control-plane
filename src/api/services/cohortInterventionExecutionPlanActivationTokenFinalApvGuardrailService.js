'use strict';

const fs = require('fs');
const path = require('path');
const builder = require('./cohortInterventionExecutionPlanActivationTokenFinalApvBuilderService').serviceInstance;

const FORBIDDEN_EXECUTION_KEYWORDS = [
  'issueActivationToken',
  'redeemActivationToken',
  'makeTokenRedeemable',
  'finalApproveAndIssue',
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
  'EXECUTE_COHORT_PAUSE',
  'EXECUTE_PARTICIPANT_RESTRICTION',
  'EXECUTE_INVITE_REVOCATION',
  'EXECUTE_CONTROLLED_EXPANSION'
];

const DANGOW_TABLES = [
  'controlled_beta_runtime_access_sessions',
  'controlled_beta_invites',
  'controlled_beta_cohort_members',
  'controlled_beta_cohort_intervention_executions',
  'execution_queue',
  'job_queue',
  'runtime_actions'
];

const SCAN_FILES = [
  'src/api/services/cohortInterventionExecutionPlanActivationTokenFinalApvBuilderService.js',
  'src/api/services/cohortInterventionExecutionPlanActivationTokenFinalApvEvaluatorService.js',
  'src/api/services/cohortInterventionExecutionPlanActivationTokenFinalApvEvidencePackService.js',
  'src/api/services/cohortInterventionExecutionPlanActivationTokenFinalApvDecisionService.js',
  'src/api/routes/controlledBetaCohortInterventionExecutionPlanActivationTokenFinalApvAdmin.js'
];

class CohortInterventionExecutionPlanActivationTokenFinalApvGuardrailService {
  async performSafetyScannerCheck(activationTokenFinalApvId) {
    const findings = [];
    
    for (const relPath of SCAN_FILES) {
      const fullPath = path.join(process.cwd(), relPath);
      if (!fs.existsSync(fullPath)) continue;

      const content = fs.readFileSync(fullPath, 'utf8');
      
      // 1. Scan keywords
      for (const keyword of FORBIDDEN_EXECUTION_KEYWORDS) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'g');
        if (regex.test(content)) {
          findings.push({
            check_type: 'FORBIDDEN_ACTIVATION_TOKEN_DETECTED',
            severity: 'CRITICAL',
            description: `Forbidden activation/execution token '${keyword}' detected inside file: ${relPath}`
          });
        }
      }

      // 2. Scan dangerous tables
      for (const table of DANGOW_TABLES) {
        const regex = new RegExp(`\\b${table}\\b`, 'g');
        if (regex.test(content)) {
          findings.push({
            check_type: 'DANGEROUS_TABLE_REFERENCE_DETECTED',
            severity: 'CRITICAL',
            description: `Forbidden database table reference '${table}' detected inside file: ${relPath}`
          });
        }
      }
    }

    if (findings.length === 0) {
      findings.push({
        check_type: 'FORBIDDEN_ACTIVATION_SCAN',
        severity: 'INFO',
        description: 'Static scan of Phase 157 components confirms zero active activation pathways or runtime table connections.'
      });
    }

    return findings;
  }

  async verifyWriteScope(activationTokenFinalApvId) {
    const record = await builder.getTokenFinalApv(activationTokenFinalApvId);
    if (!record) throw new Error('TOKEN_FINAL_APV_RECORD_NOT_FOUND');

    const attestation = typeof record.write_scope_attestation_json === 'string'
      ? JSON.parse(record.write_scope_attestation_json)
      : record.write_scope_attestation_json;

    const findings = [];
    if (!attestation || !attestation.writes_only_phase157_tables || attestation.wrote_phase128_to_156_operational_tables) {
      findings.push({
        check_type: 'WRITE_SCOPE_VIOLATION',
        severity: 'CRITICAL',
        description: 'Write scope validation failed. Phase 157 is strictly forbidden from mutating runtime tables.'
      });
    } else {
      findings.push({
        check_type: 'WRITE_SCOPE_VERIFICATION',
        severity: 'INFO',
        description: 'Verified write scope limits. Only Phase 157 schema structures are targeted.'
      });
    }

    return findings;
  }
}

const serviceInstance = new CohortInterventionExecutionPlanActivationTokenFinalApvGuardrailService();
module.exports = {
  CohortInterventionExecutionPlanActivationTokenFinalApvGuardrailService,
  serviceInstance
};
