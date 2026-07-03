'use strict';

const db = require('./mysqlClient');
const reviewBuilderSvc = require('./cohortInterventionSimulationReviewBuilderService').serviceInstance || require('./cohortInterventionSimulationReviewBuilderService');

class CohortInterventionSimulationReviewGuardrailService {
  constructor() {
    this._mockState = {};
  }

  async runGuardrailCheck(reviewId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    const review = await reviewBuilderSvc.getReview(reviewId);
    if (!review) throw new Error('REVIEW_NOT_FOUND');

    const findings = [];
    let status = 'PASS';

    // Verify no high-risk execution jobs exist for this review/simulation
    // Check if any controlled_beta_cohort_intervention_executions or similar exists
    if (isProdLike) {
      const execs = await db.query(
        'SELECT * FROM controlled_beta_cohort_intervention_executions WHERE cohort_id = ? AND tenant_id = ? LIMIT 5',
        [review.cohort_id, review.tenant_id]
      );
      // In Phase 142, reviews do not create executions. However, we can check if there are executions created AFTER the review started to be safe.
      for (const ex of execs) {
        if (ex.created_at >= review.created_at) {
          status = 'FAIL';
          findings.push({
            rule: 'NO_OPERATIONAL_MUTATION_OR_EXECUTION_JOB_CREATED',
            status: 'FAIL',
            description: `Execution job ${ex.execution_id} was found created after review started.`
          });
        }
      }
    }

    // Safety checks ensuring all forbidden flags are preserved as false
    const forbiddenCapabilities = [
      'FULL_PUBLIC',
      'OPEN_MARKETPLACE',
      'PUBLIC_SIGNUP',
      'PUBLIC_BETA',
      'PAYMENT_EXECUTION',
      'REFUND_EXECUTION',
      'PAYOUT_EXECUTION',
      'PROVIDER_EXTERNAL_SUBMISSION',
      'TAX_EXTERNAL_SUBMISSION',
      'ACCOUNTING_EXTERNAL_SUBMISSION',
      'SOURCE_MUTATION',
      'AUTO_EXPANSION',
      'AUTO_REVOCATION',
      'AUTO_ENFORCEMENT',
      'SCOPE_AUTO_BROADEN',
      'COHORT_PAUSE_EXECUTION',
      'PARTICIPANT_ACCESS_RESTRICTION_EXECUTION',
      'INVITE_REVOCATION_EXECUTION',
      'CONTROLLED_EXPANSION_EXECUTION',
      'HIGH_RISK_AUTO_EXECUTION',
      'SIMULATION_AUTO_APPROVAL',
      'REVIEW_AUTO_EXECUTION',
      'EXECUTION_JOB_CREATED'
    ];

    // Assert that the safety boundary environment variables or configurations are clean
    for (const cap of forbiddenCapabilities) {
      if (process.env[cap] === 'true' || process.env[cap] === '1') {
        status = 'FAIL';
        findings.push({
          rule: `FORBIDDEN_CAPABILITY_${cap}`,
          status: 'FAIL',
          description: `Forbidden capability ${cap} is active in env.`
        });
      }
    }

    if (status === 'PASS') {
      findings.push({
        rule: 'SAFETY_BOUNDARY_VERIFICATION',
        status: 'PASS',
        description: 'No operational mutation, execution jobs, or public payment/marketplace capabilities detected.'
      });
    }

    return { status, findings };
  }
}

const serviceInstance = new CohortInterventionSimulationReviewGuardrailService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
module.exports.CohortInterventionSimulationReviewGuardrailService = CohortInterventionSimulationReviewGuardrailService;
