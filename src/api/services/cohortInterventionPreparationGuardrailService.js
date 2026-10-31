'use strict';

class CohortInterventionPreparationGuardrailService {
  async runGuardrailChecks(preparation) {
    // Assert that the execution status of this preparation is strictly NOT_EXECUTED_PREPARATION_ONLY
    if (preparation.preparation_execution_status !== 'NOT_EXECUTED_PREPARATION_ONLY') {
      return {
        passed: false,
        reason: 'FORBIDDEN_EXECUTION_STATE_MUTATION'
      };
    }

    // Safety checks against the draft payload to ensure no automated enforcement flag is enabled
    const nonExecution = preparation.non_execution_attestation_json || {};
    if (nonExecution.auto_enforcement_triggered === true || nonExecution.cohort_access_mutated === true) {
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

const serviceInstance = new CohortInterventionPreparationGuardrailService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
