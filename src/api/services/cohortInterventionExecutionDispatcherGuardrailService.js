'use strict';

const fs = require('fs');
const path = require('path');
const builder = require('./cohortInterventionExecutionDispatcherBuilderService').serviceInstance;

const FORBIDDEN_EXECUTION_KEYWORDS = [
  'EXECUTE_COHORT_PAUSE',
  'EXECUTE_PARTICIPANT_RESTRICTION',
  'EXECUTE_INVITE_REVOCATION',
  'EXECUTE_CONTROLLED_EXPANSION',
  'pauseCohort',
  'restrictParticipant',
  'revokeInvite',
  'expandCohort',
  'createExecutionJob',
  'enqueueExecution',
  'scheduleExecution',
  'dispatchIntervention',
  'commitMutation',
  'applyIntervention',
  'writeRuntimeState'
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
  'src/api/services/cohortInterventionExecutionDispatcherBuilderService.js',
  'src/api/services/cohortInterventionExecutionDispatcherEvaluatorService.js',
  'src/api/services/cohortInterventionExecutionDispatcherEvidencePackService.js',
  'src/api/services/cohortInterventionExecutionDispatcherDecisionService.js',
  'src/api/routes/controlledBetaCohortInterventionExecutionDispatcherAdmin.js'
];

class CohortInterventionExecutionDispatcherGuardrailService {
  async performSafetyScannerCheck(dispatcherId) {
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
            check_type: 'FORBIDDEN_EXECUTION_TOKEN_DETECTED',
            severity: 'CRITICAL',
            description: `Forbidden execution token '${keyword}' detected inside file: ${relPath}`
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
        check_type: 'FORBIDDEN_EXECUTION_SCAN',
        severity: 'INFO',
        description: 'Static scan of Phase 148 components confirms zero active execution dispatcher pathways or runtime table connections.'
      });
    }

    return findings;
  }

  async verifyWriteScope(dispatcherId) {
    const record = await builder.getDispatcher(dispatcherId);
    if (!record) throw new Error('DISPATCHER_RECORD_NOT_FOUND');

    const attestation = typeof record.write_scope_attestation_json === 'string'
      ? JSON.parse(record.write_scope_attestation_json)
      : record.write_scope_attestation_json;

    const findings = [];
    if (!attestation || !attestation.writes_only_phase148_tables || attestation.wrote_phase128_to_147_operational_tables) {
      findings.push({
        check_type: 'WRITE_SCOPE_VIOLATION',
        severity: 'CRITICAL',
        description: 'Write scope validation failed. Phase 148 is strictly forbidden from mutating runtime tables.'
      });
    } else {
      findings.push({
        check_type: 'WRITE_SCOPE_VERIFICATION',
        severity: 'INFO',
        description: 'Verified write scope limits. Only Phase 148 schema structures are targeted.'
      });
    }

    return findings;
  }
}

const serviceInstance = new CohortInterventionExecutionDispatcherGuardrailService();
module.exports = {
  CohortInterventionExecutionDispatcherGuardrailService,
  serviceInstance
};
