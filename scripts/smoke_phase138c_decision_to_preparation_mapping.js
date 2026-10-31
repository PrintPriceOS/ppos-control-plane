'use strict';

const plannerService = require('../src/api/services/cohortInterventionPreparationPlannerService').serviceInstance || require('../src/api/services/cohortInterventionPreparationPlannerService');

(async () => {
  console.log('=== Smoke 138C: Decision to Preparation Type Mapping ===\n');

  try {
    const mappings = {
      'CONTINUE_COHORT': 'PREPARE_COHORT_CONTINUATION',
      'PAUSE_COHORT': 'PREPARE_COHORT_PAUSE',
      'REQUIRE_MANUAL_INTERVENTION': 'PREPARE_MANUAL_INTERVENTION',
      'MARK_OPERATIONAL_RISK': 'PREPARE_RISK_ESCALATION',
      'PREPARE_CONTROLLED_EXPANSION': 'PREPARE_CONTROLLED_EXPANSION',
      'REQUEST_MORE_OBSERVATION': 'PREPARE_OBSERVATION_EXTENSION'
    };

    for (const [decision, expectedType] of Object.entries(mappings)) {
      const plan = plannerService.planIntervention(decision);
      if (plan.preparationType !== expectedType) {
        console.error(`FAIL: Mapped ${decision} to ${plan.preparationType}, expected ${expectedType}`);
        process.exit(1);
      }
      console.log(`  PASS: Deterministically mapped ${decision} to ${expectedType}`);
    }

    console.log('\nSmoke 138C: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 138C:', e);
    process.exit(1);
  }
})();
