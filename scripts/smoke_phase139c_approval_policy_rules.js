'use strict';

const policyService = require('../src/api/services/cohortInterventionApprovalPolicyService').serviceInstance || require('../src/api/services/cohortInterventionApprovalPolicyService');

(async () => {
  console.log('=== Smoke 139C: Approval Policy Mapping Rules ===\n');

  try {
    const testCases = [
      { type: 'PREPARE_COHORT_CONTINUATION', risk: 'LOW', expectedName: 'LOW_RISK_CONTINUATION_POLICY', expectedRoles: ['operator'] },
      { type: 'PREPARE_COHORT_CONTINUATION', risk: 'HIGH', expectedName: 'MEDIUM_RISK_CONTINUATION_POLICY', expectedRoles: ['operator', 'beta_lead'] },
      { type: 'PREPARE_COHORT_PAUSE', risk: 'LOW', expectedName: 'MEDIUM_RISK_PAUSE_POLICY', expectedRoles: ['beta_lead', 'operations_lead'] },
      { type: 'PREPARE_COHORT_PAUSE', risk: 'HIGH', expectedName: 'HIGH_RISK_PAUSE_POLICY', expectedRoles: ['operations_lead', 'governance_owner'] },
      { type: 'PREPARE_CONTROLLED_EXPANSION', risk: 'LOW', expectedName: 'EXPANSION_POLICY', expectedRoles: ['beta_lead', 'governance_owner'] },
      { type: 'PREPARE_CONTROLLED_EXPANSION', risk: 'CRITICAL', expectedName: 'HIGH_EXPANSION_POLICY', expectedRoles: ['beta_lead', 'operations_lead', 'governance_owner'] }
    ];

    for (const tc of testCases) {
      const policy = policyService.determineRequiredApprovers(tc.type, tc.risk);
      if (policy.policyName !== tc.expectedName) {
        console.error(`FAIL: ${tc.type} with risk ${tc.risk} mapped to policy name ${policy.policyName}, expected ${tc.expectedName}`);
        process.exit(1);
      }

      // Check roles
      const sortedRoles = [...policy.requiredRoles].sort();
      const sortedExpected = [...tc.expectedRoles].sort();
      if (JSON.stringify(sortedRoles) !== JSON.stringify(sortedExpected)) {
        console.error(`FAIL: Mapped to roles ${JSON.stringify(sortedRoles)}, expected ${JSON.stringify(sortedExpected)}`);
        process.exit(1);
      }

      console.log(`  PASS: Deterministically mapped ${tc.type} (${tc.risk}) to ${tc.expectedName}.`);
    }

    console.log('\nSmoke 139C: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 139C:', e);
    process.exit(1);
  }
})();
