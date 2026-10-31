'use strict';

class CohortInterventionApprovalGuardrailService {
  async runGuardrailChecks(approval) {
    // Assert that the approval decision is NOT execution itself
    if (approval.approval_status === 'APPROVED' && approval.approval_decision !== 'APPROVE_FOR_FUTURE_EXECUTION') {
      return {
        passed: false,
        reason: 'INVALID_DECISION_FOR_APPROVED_STATUS'
      };
    }

    const nonExecution = approval.non_execution_attestation_json || {};
    if (nonExecution.approval_executed_intervention === true || nonExecution.cohort_access_mutated === true || nonExecution.execution_job_created === true) {
      return {
        passed: false,
        reason: 'MUTATING_SAFETY_INVARIANT_VIOLATION'
      };
    }

    return {
      passed: true,
      reason: 'READY'
    };
  }
}

const serviceInstance = new CohortInterventionApprovalGuardrailService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
