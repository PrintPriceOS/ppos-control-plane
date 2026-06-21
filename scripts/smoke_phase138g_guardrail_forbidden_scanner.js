'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 138G: Forbidden Mutation Patterns Scanner ===\n');

try {
  const serviceFiles = [
    'cohortInterventionPreparationBuilderService.js',
    'cohortInterventionPreparationPlannerService.js',
    'cohortInterventionPreparationReviewService.js',
    'cohortInterventionPreparationEvidencePackService.js',
    'cohortInterventionPreparationAuditService.js',
    'cohortInterventionPreparationGuardrailService.js'
  ];

  const routerFiles = [
    'controlledBetaCohortInterventionPreparationAdmin.js'
  ];

  const forbidden = [
    'fullPublicEnabled: true',
    'openMarketplaceEnabled: true',
    'publicSignupEnabled: true',
    'publicBetaEnabled: true',
    'paymentExecutionEnabled: true',
    'refundExecutionEnabled: true',
    'payoutExecutionEnabled: true',
    'providerExternalSubmissionEnabled: true',
    'externalTaxSubmissionEnabled: true',
    'externalAccountingSubmissionEnabled: true',
    'sourceMutationEnabled: true',
    'autoExpansionEnabled: true',
    'autoRevocationEnabled: true',
    'autoEnforcementEnabled: true',
    'scopeAutoBroadenEnabled: true',
    'enableFullPublic',
    'enableOpenMarketplace',
    'enablePublicBeta',
    'charge(',
    'capture(',
    'refund(',
    'payout(',
    'sendToProvider',
    'submitTax',
    'submitVat',
    'submitAccounting',
    // Hardened function signature checks from Phase 138 plan review notes
    'mutateCohortAccess',
    'applyIntervention',
    'pauseCohortAccess',
    'pauseCohort',
    'revokeParticipant',
    'expandCohort',
    'mutateBilling',
    'executePayment',
    'submitProviderPayload',
    'enablePublicMarketplace',
    'autoEnforceDecision',
    'restrictCohortAccess',
    'restrictParticipantAccess'
  ];

  for (const filename of serviceFiles) {
    const filePath = path.join(__dirname, `../src/api/services/${filename}`);
    if (!fs.existsSync(filePath)) continue;

    let code = fs.readFileSync(filePath, 'utf8');
    // Strip comments
    code = code.replace(/\/\/.*/g, '');
    code = code.replace(/\/\*[\s\S]*?\*\//g, '');

    for (const pattern of forbidden) {
      assert(!code.includes(pattern), `${filename} does not contain forbidden pattern: ${pattern}`);
    }
  }

  for (const filename of routerFiles) {
    const filePath = path.join(__dirname, `../src/api/routes/${filename}`);
    if (!fs.existsSync(filePath)) continue;

    let code = fs.readFileSync(filePath, 'utf8');
    code = code.replace(/\/\/.*/g, '');
    code = code.replace(/\/\*[\s\S]*?\*\//g, '');

    for (const pattern of forbidden) {
      assert(!code.includes(pattern), `${filename} does not contain forbidden pattern: ${pattern}`);
    }
  }

  console.log(`\nSmoke 138G: Finished. ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
} catch (e) {
  console.error('FAIL in 138G:', e);
  process.exit(1);
}
