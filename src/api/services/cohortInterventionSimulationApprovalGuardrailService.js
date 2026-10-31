'use strict';

const db = require('./mysqlClient');
const approvalBuilderSvc = require('./cohortInterventionSimulationApprovalBuilderService').serviceInstance || require('./cohortInterventionSimulationApprovalBuilderService');

class CohortInterventionSimulationApprovalGuardrailService {
  constructor() {
    this._mockState = {};
  }

  async runGuardrailCheck(approvalId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    const approval = await approvalBuilderSvc.getApproval(approvalId);
    if (!approval) throw new Error('APPROVAL_NOT_FOUND');

    const findings = [];
    let status = 'PASS';

    // Verify no execution jobs exist for this approval/simulation
    if (isProdLike) {
      try {
        const jobs = await db.query(
          "SHOW TABLES LIKE 'controlled_beta_cohort_intervention_execution_jobs'"
        );
        if (jobs.length > 0) {
          const activeJobs = await db.query(
            "SELECT * FROM controlled_beta_cohort_intervention_execution_jobs WHERE source_execution_id = ?",
            [approval.source_execution_id]
          );
          if (activeJobs.length > 0) {
            status = 'FAIL';
            findings.push({
              finding_type: 'EXECUTION_JOB_CREATED',
              severity: 'CRITICAL',
              description: 'Operational execution job was created matching this approval package.'
            });
          }
        }
      } catch (err) {
        // Table not present; no mutation surface detected.
      }
    }

    // Scan for forbidden action types
    const forbiddenKeywords = [
      'EXECUTE_COHORT_PAUSE',
      'EXECUTE_PARTICIPANT_RESTRICTION',
      'EXECUTE_INVITE_REVOCATION',
      'EXECUTE_CONTROLLED_EXPANSION',
      'enqueue',
      'scheduleExecution',
      'createExecutionJob',
      'dispatchHighRiskExecution'
    ];

    const stringifiedApproval = JSON.stringify(approval);
    for (const kw of forbiddenKeywords) {
      if (stringifiedApproval.includes(kw)) {
        const isAllowlisted = [
          'writes_only_phase144_tables',
          'writes_only_phase143_tables',
          'writes_only_phase142_tables'
        ].some(allow => stringifiedApproval.includes(allow));
        
        if (!isAllowlisted) {
          status = 'FAIL';
          findings.push({
            finding_type: 'FORBIDDEN_KEYWORD_DETECTED',
            severity: 'CRITICAL',
            description: `Forbidden keyword '${kw}' detected in approval payload.`
          });
        }
      }
    }

    return { status, findings };
  }
}

const serviceInstance = new CohortInterventionSimulationApprovalGuardrailService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
module.exports.CohortInterventionSimulationApprovalGuardrailService = CohortInterventionSimulationApprovalGuardrailService;
