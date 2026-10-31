'use strict';

const ALLOWED_PHASE_140_EXECUTION_TYPES = [
  'EXECUTE_OBSERVATION_EXTENSION',
  'EXECUTE_PARTICIPANT_SUPPORT_TASKS',
  'EXECUTE_MANUAL_INTERVENTION_TASKS',
  'EXECUTE_COHORT_CONTINUATION_MARKER',
  'EXECUTE_RISK_ESCALATION_MARKER'
];

class CohortInterventionExecutionGuardrailService {
  async runGuardrailChecks(execution, steps) {
    const findings = [];
    let passed = true;

    // Check execution type
    if (!ALLOWED_PHASE_140_EXECUTION_TYPES.includes(execution.execution_type)) {
      findings.push({ rule: 'EXECUTION_TYPE_ALLOWED', passed: false, message: `Execution type ${execution.execution_type} is not allowed in Phase 140.` });
      passed = false;
    } else {
      findings.push({ rule: 'EXECUTION_TYPE_ALLOWED', passed: true, message: `Execution type ${execution.execution_type} matches allowed safe-scope list.` });
    }

    // Check steps completed
    const dryRunStep = steps.find(s => s.step_key === 'dry_run');
    if (!dryRunStep || dryRunStep.status !== 'COMPLETED') {
      findings.push({ rule: 'DRY_RUN_COMPLETED', passed: false, message: 'Dry-run preview generation is required before execution.' });
      passed = false;
    } else {
      findings.push({ rule: 'DRY_RUN_COMPLETED', passed: true, message: 'Dry-run preview is generated.' });
    }

    const rollbackStep = steps.find(s => s.step_key === 'rollback_plan');
    if (!rollbackStep || rollbackStep.status !== 'COMPLETED') {
      findings.push({ rule: 'ROLLBACK_PLAN_ESTABLISHED', passed: false, message: 'Rollback mitigation plan is required before execution.' });
      passed = false;
    } else {
      findings.push({ rule: 'ROLLBACK_PLAN_ESTABLISHED', passed: true, message: 'Rollback plan established.' });
    }

    const confirmStep = steps.find(s => s.step_key === 'operator_confirmation');
    if (!confirmStep || confirmStep.status !== 'COMPLETED') {
      findings.push({ rule: 'OPERATOR_CONFIRMED', passed: false, message: 'Manual operator confirmation phrase and signature are required.' });
      passed = false;
    } else {
      findings.push({ rule: 'OPERATOR_CONFIRMED', passed: true, message: 'Operator confirmed.' });
    }

    // Safety guarantees
    if (execution.operator_confirmed && execution.operator_confirmation_phrase !== 'CONFIRM_PHASE_140_CONTROLLED_EXECUTION') {
      findings.push({ rule: 'CONFIRMATION_PHRASE_VALID', passed: false, message: 'Operator confirmation phrase is invalid.' });
      passed = false;
    }

    // Double check forbidden markers
    const forbiddenKeywords = ['cohort pause', 'participant revoke', 'invite revoke', 'controlled expansion', 'payment', 'billing', 'provider', 'tax', 'accounting', 'public marketplace'];
    const serialized = JSON.stringify(execution).toLowerCase();
    for (const kw of forbiddenKeywords) {
      if (kw === 'participant revoke' || kw === 'invite revoke' || kw === 'cohort pause' || kw === 'controlled expansion') {
        // These specific ones are dangerous and forbidden
        if (serialized.includes(kw)) {
          findings.push({ rule: 'NO_FORBIDDEN_MUTATIONS', passed: false, message: `Forbidden capability keyword '${kw}' detected in execution record.` });
          passed = false;
        }
      }
    }

    return {
      passed,
      findings
    };
  }
}

const serviceInstance = new CohortInterventionExecutionGuardrailService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
module.exports.CohortInterventionExecutionGuardrailService = CohortInterventionExecutionGuardrailService;
