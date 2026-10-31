'use strict';

const fs = require('fs');
const path = require('path');
const builder = require('./cohortInterventionExecutionPlanActivationAuthorizationBuilderService').serviceInstance;

const FORBIDDEN_EXECUTION_KEYWORDS = [
  'activateExecutionPlan',
  'authorizeAndActivate',
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

const DANGEROUS_TABLES = [
  'controlled_beta_runtime_access_sessions',
  'controlled_beta_invites',
  'controlled_beta_cohort_members',
  'controlled_beta_cohort_intervention_executions',
  'execution_queue',
  'job_queue',
  'runtime_actions'
];

const SCAN_FILES = [
  'src/api/services/cohortInterventionExecutionPlanActivationAuthorizationBuilderService.js',
  'src/api/services/cohortInterventionExecutionPlanActivationAuthorizationEvaluatorService.js',
  'src/api/services/cohortInterventionExecutionPlanActivationAuthorizationEvidencePackService.js',
  'src/api/services/cohortInterventionExecutionPlanActivationAuthorizationDecisionService.js',
  'src/api/routes/controlledBetaCohortInterventionExecutionPlanActivationAuthorizationAdmin.js'
];

class CohortInterventionExecutionPlanActivationAuthorizationGuardrailService {
  async performSafetyScannerCheck(activationAuthId) {
    const findings = [];
    
    // We search the keywords dynamically to avoid self-triggering
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
      for (const table of DANGEROUS_TABLES) {
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
        description: 'Static scan of Phase 151 components confirms zero active activation authorization pathways or runtime table connections.'
      });
    }

    return findings;
  }

  async verifyWriteScope(activationAuthId) {
    const record = await builder.getAuthorization(activationAuthId);
    if (!record) throw new Error('AUTHORIZATION_RECORD_NOT_FOUND');

    const attestation = typeof record.write_scope_attestation_json === 'string'
      ? JSON.parse(record.write_scope_attestation_json)
      : record.write_scope_attestation_json;

    const findings = [];
    if (!attestation || !attestation.writes_only_phase151_tables || attestation.wrote_phase128_to_150_operational_tables) {
      findings.push({
        check_type: 'WRITE_SCOPE_VIOLATION',
        severity: 'CRITICAL',
        description: 'Write scope validation failed. Phase 151 is strictly forbidden from mutating runtime tables.'
      });
    } else {
      findings.push({
        check_type: 'WRITE_SCOPE_VERIFICATION',
        severity: 'INFO',
        description: 'Verified write scope limits. Only Phase 151 schema structures are targeted.'
      });
    }

    return findings;
  }
}

const serviceInstance = new CohortInterventionExecutionPlanActivationAuthorizationGuardrailService();
module.exports = {
  CohortInterventionExecutionPlanActivationAuthorizationGuardrailService,
  serviceInstance
};
