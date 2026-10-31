'use strict';

// Phase 141 Guardrail Service
// Technical enforcement of the core safety invariant:
//   "Phase 141 simulations write only to Phase 141 simulation tables.
//    Zero writes to any Phase 128-140 operational tables."

const ALLOWED_SIMULATION_TYPES = [
  'SIMULATE_COHORT_PAUSE',
  'SIMULATE_PARTICIPANT_ACCESS_RESTRICTION',
  'SIMULATE_INVITE_REVOCATION',
  'SIMULATE_CONTROLLED_EXPANSION'
];

// Operational table name patterns that must NOT appear as mutation targets in any simulation payload.
// These can appear as lineage metadata references (read-only) but never as write targets.
const FORBIDDEN_MUTATION_TABLE_PATTERNS = [
  'controlled_beta_runtime_access_sessions',
  'controlled_beta_invites',
  'controlled_beta_participants',
  'controlled_beta_runtime_activity_reviews',
  'controlled_beta_cohort_intervention_preparations',
  'controlled_beta_cohort_intervention_approvals',
  'controlled_beta_cohort_intervention_executions',
  'controlled_beta_runtime_activity_observations',
  'controlled_beta_cohort_session_events',
  'marketplace_orders',
  'payment',
  'billing',
  'provider_submission',
  'tax_submission',
  'accounting_submission',
  'public_marketplace'
];

// Forbidden execution capability keywords that indicate real operational mutation
const FORBIDDEN_CAPABILITY_KEYWORDS = [
  'cohort pause execution',
  'participant revoke',
  'invite revoke',
  'execute_cohort_pause',
  'execute_participant_access_restriction',
  'execute_invite_revocation',
  'execute_controlled_expansion'
];

class CohortInterventionSimulationGuardrailService {
  async runGuardrailChecks(simulation, steps) {
    const findings = [];
    let passed = true;

    // 1. Simulation type must be allowed
    if (!ALLOWED_SIMULATION_TYPES.includes(simulation.simulation_type)) {
      findings.push({
        rule: 'SIMULATION_TYPE_ALLOWED',
        passed: false,
        message: `Simulation type '${simulation.simulation_type}' is not in the Phase 141 allowed list.`
      });
      passed = false;
    } else {
      findings.push({
        rule: 'SIMULATION_TYPE_ALLOWED',
        passed: true,
        message: `Simulation type '${simulation.simulation_type}' is allowed in Phase 141.`
      });
    }

    // 2. All required steps must be COMPLETED
    const requiredSteps = ['impact_analysis', 'rollback_preview', 'operator_confirmation'];
    for (const stepKey of requiredSteps) {
      const step = steps.find(s => s.step_key === stepKey);
      if (!step || step.status !== 'COMPLETED') {
        findings.push({
          rule: `STEP_${stepKey.toUpperCase()}_COMPLETED`,
          passed: false,
          message: `Required step '${stepKey}' is not completed.`
        });
        passed = false;
      } else {
        findings.push({
          rule: `STEP_${stepKey.toUpperCase()}_COMPLETED`,
          passed: true,
          message: `Step '${stepKey}' is completed.`
        });
      }
    }

    // 3. Operator confirmation phrase must be valid
    if (simulation.operator_confirmed) {
      if (simulation.operator_confirmation_phrase !== 'CONFIRM_PHASE_141_HIGH_RISK_SIMULATION') {
        findings.push({
          rule: 'CONFIRMATION_PHRASE_VALID',
          passed: false,
          message: 'Operator confirmation phrase is invalid.'
        });
        passed = false;
      } else {
        findings.push({
          rule: 'CONFIRMATION_PHRASE_VALID',
          passed: true,
          message: 'Operator confirmation phrase is valid.'
        });
      }
    }

    // 4. Write scope attestation must assert no operational table writes
    const attestation = typeof simulation.simulation_write_scope_attestation_json === 'string'
      ? JSON.parse(simulation.simulation_write_scope_attestation_json)
      : (simulation.simulation_write_scope_attestation_json || {});

    if (!attestation.writes_only_phase141_tables || attestation.wrote_phase128_to_140_operational_tables) {
      findings.push({
        rule: 'WRITE_SCOPE_PHASE141_ONLY',
        passed: false,
        message: 'Write scope attestation indicates writes to operational tables — forbidden in Phase 141.'
      });
      passed = false;
    } else {
      findings.push({
        rule: 'WRITE_SCOPE_PHASE141_ONLY',
        passed: true,
        message: 'Write scope attestation confirms Phase 141 tables only.'
      });
    }

    // 5. Payload must not contain forbidden operational table mutation patterns
    const serializedPayload = JSON.stringify(simulation).toLowerCase();

    for (const pattern of FORBIDDEN_MUTATION_TABLE_PATTERNS) {
      const lp = pattern.toLowerCase();
      // Check for mutation intent patterns (INSERT INTO, UPDATE, DELETE FROM) combined with the table name
      const mutationPatterns = [
        `insert into ${lp}`,
        `update ${lp}`,
        `delete from ${lp}`
      ];
      for (const mutPat of mutationPatterns) {
        if (serializedPayload.includes(mutPat)) {
          findings.push({
            rule: 'NO_FORBIDDEN_TABLE_MUTATIONS',
            passed: false,
            message: `Forbidden mutation pattern detected: '${mutPat}' in simulation record.`
          });
          passed = false;
        }
      }
    }

    // 6. No forbidden capability keywords that indicate real execution
    for (const kw of FORBIDDEN_CAPABILITY_KEYWORDS) {
      if (serializedPayload.includes(kw.toLowerCase())) {
        findings.push({
          rule: 'NO_FORBIDDEN_EXECUTION_CAPABILITIES',
          passed: false,
          message: `Forbidden execution capability keyword detected: '${kw}'.`
        });
        passed = false;
      }
    }

    if (passed) {
      findings.push({
        rule: 'NO_FORBIDDEN_MUTATIONS',
        passed: true,
        message: 'No forbidden operational table mutations or capability keywords detected in simulation payload.'
      });
    }

    return { passed, findings };
  }
}

const serviceInstance = new CohortInterventionSimulationGuardrailService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
module.exports.CohortInterventionSimulationGuardrailService = CohortInterventionSimulationGuardrailService;
