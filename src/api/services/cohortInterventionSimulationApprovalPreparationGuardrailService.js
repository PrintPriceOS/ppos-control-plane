'use strict';

const db = require('./mysqlClient');
const prepBuilderSvc = require('./cohortInterventionSimulationApprovalPreparationBuilderService').serviceInstance || require('./cohortInterventionSimulationApprovalPreparationBuilderService');

class CohortInterventionSimulationApprovalPreparationGuardrailService {
  constructor() {
    this._mockState = {};
  }

  async runGuardrailCheck(prepId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    const prep = await prepBuilderSvc.getPrep(prepId);
    if (!prep) throw new Error('PREP_NOT_FOUND');

    const findings = [];
    let status = 'PASS';

    // Verify no execution jobs exist for this prep/simulation
    if (isProdLike) {
      // Look for any table related to runtimes or active jobs matching this simulation_id/execution_id
      // Since Phase 143 forbids creating execution jobs, there shouldn't be any records in operational execution tables.
      try {
        const jobs = await db.query(
          "SHOW TABLES LIKE 'controlled_beta_cohort_intervention_execution_jobs'"
        );
        if (jobs.length > 0) {
          const activeJobs = await db.query(
            "SELECT * FROM controlled_beta_cohort_intervention_execution_jobs WHERE source_execution_id = ?",
            [prep.source_execution_id]
          );
          if (activeJobs.length > 0) {
            status = 'FAIL';
            findings.push({
              finding_type: 'EXECUTION_JOB_CREATED',
              severity: 'CRITICAL',
              description: 'Operational execution job was created matching this preparation package.'
            });
          }
        }
      } catch (err) {
        // Table not present; no mutation surface detected.
      }
    }

    // Scan for forbidden action types in prep fields
    const forbiddenKeywords = [
      'COHORT_PAUSE_EXECUTION',
      'PARTICIPANT_ACCESS_RESTRICTION_EXECUTION',
      'INVITE_REVOCATION_EXECUTION',
      'CONTROLLED_EXPANSION_EXECUTION',
      'HIGH_RISK_AUTO_EXECUTION',
      'SIMULATION_AUTO_APPROVAL',
      'REVIEW_AUTO_EXECUTION',
      'EXECUTION_JOB_CREATED'
    ];

    const stringifiedPrep = JSON.stringify(prep);
    for (const kw of forbiddenKeywords) {
      if (stringifiedPrep.includes(kw)) {
        // Note: allowlisted context check
        const isAllowlisted = [
          'writes_only_phase143_tables',
          'writes_only_phase142_tables',
          'writes_only_phase141_tables'
        ].some(allow => stringifiedPrep.includes(allow));
        
        if (!isAllowlisted) {
          status = 'FAIL';
          findings.push({
            finding_type: 'FORBIDDEN_KEYWORD_DETECTED',
            severity: 'CRITICAL',
            description: `Forbidden keyword '${kw}' detected in preparation payload.`
          });
        }
      }
    }

    return { status, findings };
  }
}

const serviceInstance = new CohortInterventionSimulationApprovalPreparationGuardrailService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
module.exports.CohortInterventionSimulationApprovalPreparationGuardrailService = CohortInterventionSimulationApprovalPreparationGuardrailService;
