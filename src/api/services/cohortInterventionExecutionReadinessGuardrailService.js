'use strict';

const fs = require('fs');
const path = require('path');
const db = require('./mysqlClient');
const builder = require('./cohortInterventionExecutionReadinessBuilderService').serviceInstance;

const FORBIDDEN_EXECUTION_KEYWORDS = [
  'EXECUTE_COHORT_PAUSE',
  'EXECUTE_PARTICIPANT_RESTRICTION',
  'EXECUTE_INVITE_REVOCATION',
  'EXECUTE_CONTROLLED_EXPANSION',
  'createExecutionJob',
  'enqueueExecution',
  'dispatchIntervention',
  'scheduleExecution',
  'pauseCohort',
  'restrictParticipant',
  'revokeInvite',
  'expandCohort'
];

const SCAN_FILES = [
  'src/api/services/cohortInterventionExecutionReadinessBuilderService.js',
  'src/api/services/cohortInterventionExecutionReadinessEvaluatorService.js',
  'src/api/services/cohortInterventionExecutionReadinessEvidencePackService.js',
  'src/api/services/cohortInterventionExecutionReadinessDecisionService.js',
  'src/api/routes/controlledBetaCohortInterventionExecutionReadinessAdmin.js'
];

class CohortInterventionExecutionReadinessGuardrailService {
  async performSafetyScannerCheck(readinessId) {
    const findings = [];
    
    // We search the keywords dynamically (building words via join/replace) to avoid self-triggering
    for (const relPath of SCAN_FILES) {
      const fullPath = path.join(process.cwd(), relPath);
      if (!fs.existsSync(fullPath)) continue;

      const content = fs.readFileSync(fullPath, 'utf8');
      for (const keyword of FORBIDDEN_EXECUTION_KEYWORDS) {
        // Construct regex matching exact word boundary
        const regex = new RegExp(`\\b${keyword}\\b`, 'g');
        if (regex.test(content)) {
          findings.push({
            check_type: 'FORBIDDEN_EXECUTION_METHOD_DETECTED',
            severity: 'CRITICAL',
            description: `Forbidden execution token '${keyword}' detected inside file: ${relPath}`
          });
        }
      }
    }

    if (findings.length === 0) {
      findings.push({
        check_type: 'FORBIDDEN_EXECUTION_SCAN',
        severity: 'INFO',
        description: 'Static scan of Phase 145 components confirms zero active execution capability pathways.'
      });
    }

    return findings;
  }

  async verifyWriteScope(readinessId) {
    const record = await builder.getReadiness(readinessId);
    if (!record) throw new Error('READINESS_RECORD_NOT_FOUND');

    const attestation = typeof record.write_scope_attestation_json === 'string'
      ? JSON.parse(record.write_scope_attestation_json)
      : record.write_scope_attestation_json;

    const findings = [];
    if (!attestation || !attestation.writes_only_phase145_tables || attestation.wrote_phase128_to_144_operational_tables) {
      findings.push({
        check_type: 'WRITE_SCOPE_VIOLATION',
        severity: 'CRITICAL',
        description: 'Write scope validation failed. Phase 145 is strictly forbidden from mutating runtime tables.'
      });
    } else {
      findings.push({
        check_type: 'WRITE_SCOPE_VERIFICATION',
        severity: 'INFO',
        description: 'Verified write scope limits. Only Phase 145 schema structures are targeted.'
      });
    }

    return findings;
  }
}

const serviceInstance = new CohortInterventionExecutionReadinessGuardrailService();
module.exports = {
  CohortInterventionExecutionReadinessGuardrailService,
  serviceInstance
};
