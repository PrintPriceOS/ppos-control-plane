'use strict';
// Phase 119B Smoke Test — Security/Compliance Pre-Launch Hardening Service

const fs = require('fs');
const path = require('path');

let pass = 0;
let fail = 0;

function check(label, condition) {
  if (condition) {
    console.log(`  PASS  ${label}`);
    pass++;
  } else {
    console.error(`  FAIL  ${label}`);
    fail++;
  }
}

console.log('\n=== Phase 119B — Security Compliance Hardening Service Smoke ===\n');

const servicePath = path.join(__dirname, '../src/api/services/prelaunchSecurityComplianceHardeningService.js');
check('Service file exists', fs.existsSync(servicePath));

if (fs.existsSync(servicePath)) {
  const src = fs.readFileSync(servicePath, 'utf8');

  // Method existence
  check('scanEnvExposure method exists', src.includes('async scanEnvExposure('));
  check('scanAdminRouteProtection method exists', src.includes('async scanAdminRouteProtection('));
  check('scanSecretLeakagePatterns method exists', src.includes('async scanSecretLeakagePatterns('));
  check('scanRedactionCoverage method exists', src.includes('async scanRedactionCoverage('));
  check('evaluateRoleBoundaryReadiness method exists', src.includes('async evaluateRoleBoundaryReadiness('));
  check('evaluateComplianceGuardrails method exists', src.includes('async evaluateComplianceGuardrails('));
  check('recordSecurityFinding method exists', src.includes('async recordSecurityFinding('));
  check('resolveSecurityFinding method exists', src.includes('async resolveSecurityFinding('));
  check('buildSecurityComplianceEvidencePack method exists', src.includes('async buildSecurityComplianceEvidencePack('));

  // Safety flags
  check('review_only: true in SAFETY_FLAGS', src.includes('review_only: true'));
  check('external_submission_enabled: false in SAFETY_FLAGS', src.includes('external_submission_enabled: false'));
  check('source_mutation_enabled: false in SAFETY_FLAGS', src.includes('source_mutation_enabled: false'));
  check('production_activation_enabled: false in SAFETY_FLAGS', src.includes('production_activation_enabled: false'));
  check('payment_execution_enabled: false in SAFETY_FLAGS', src.includes('payment_execution_enabled: false'));
  check('full_public_enabled: false in SAFETY_FLAGS', src.includes('full_public_enabled: false'));
  check('live_provider_connectivity_enabled: false in SAFETY_FLAGS', src.includes('live_provider_connectivity_enabled: false'));

  // Safety markers
  check('reviewOnly: true in SAFETY_MARKERS', src.includes('reviewOnly: true'));
  check('sourceMutation: false in SAFETY_MARKERS', src.includes('sourceMutation: false'));
  check('productionActivationEnabled: false in SAFETY_MARKERS', src.includes('productionActivationEnabled: false'));

  // Phase safety string
  check('PHASE_119_REVIEW_ONLY safety string present', src.includes('PHASE_119_REVIEW_ONLY'));

  // Compliance guardrails list
  check('PRODUCTION_ACTIVATION_GATED guardrail present', src.includes('PRODUCTION_ACTIVATION_GATED'));
  check('FULL_PUBLIC_DISABLED guardrail present', src.includes('FULL_PUBLIC_DISABLED'));
  check('PAYMENT_EXECUTION_DISABLED guardrail present', src.includes('PAYMENT_EXECUTION_DISABLED'));
  check('SOURCE_RECORD_MUTATION_DISABLED guardrail present', src.includes('SOURCE_RECORD_MUTATION_DISABLED'));
  check('EXTERNAL_TAX_SUBMISSION_DISABLED guardrail present', src.includes('EXTERNAL_TAX_SUBMISSION_DISABLED'));

  // Evidence pack returns safety_invariants
  check('buildSecurityComplianceEvidencePack includes safety_invariants', src.includes('safety_invariants'));
  check('Evidence pack includes NOT_ENABLED markers', src.includes('NOT_ENABLED'));

  // No forbidden execution patterns
  check('No charge( call', !src.includes('charge('));
  check('No refund( call', !src.includes('refund('));
  check('No payout( call', !src.includes('payout('));
  check('No submitTax call', !src.includes('submitTax'));
  check('No sendToProvider call', !src.includes('sendToProvider'));
  check('No externalSubmission: true', !src.includes('externalSubmission: true'));
  check('No sourceMutation: true', !src.includes('sourceMutation: true'));
  check('No fullPublicEnabled: true', !src.includes('fullPublicEnabled: true'));
  check('No paymentExecutionEnabled: true', !src.includes('paymentExecutionEnabled: true'));
  check('No liveProviderConnectivityEnabled: true', !src.includes('liveProviderConnectivityEnabled: true'));
}

// Runtime check
try {
  const PrelaunchSecurityComplianceHardeningService = require('../src/api/services/prelaunchSecurityComplianceHardeningService');
  const svc = new PrelaunchSecurityComplianceHardeningService();

  check('Service instantiates without DB', svc !== null);
  check('scanEnvExposure is a function', typeof svc.scanEnvExposure === 'function');
  check('scanAdminRouteProtection is a function', typeof svc.scanAdminRouteProtection === 'function');
  check('scanSecretLeakagePatterns is a function', typeof svc.scanSecretLeakagePatterns === 'function');
  check('scanRedactionCoverage is a function', typeof svc.scanRedactionCoverage === 'function');
  check('evaluateRoleBoundaryReadiness is a function', typeof svc.evaluateRoleBoundaryReadiness === 'function');
  check('evaluateComplianceGuardrails is a function', typeof svc.evaluateComplianceGuardrails === 'function');
  check('recordSecurityFinding is a function', typeof svc.recordSecurityFinding === 'function');
  check('resolveSecurityFinding is a function', typeof svc.resolveSecurityFinding === 'function');
  check('buildSecurityComplianceEvidencePack is a function', typeof svc.buildSecurityComplianceEvidencePack === 'function');

  // Runtime: scanEnvExposure returns safety markers
  svc.scanEnvExposure({ actor: 'smoke-test' }).then(result => {
    check('scanEnvExposure returns reviewOnly: true', result.reviewOnly === true);
    check('scanEnvExposure returns safetyMarkers', result.safetyMarkers !== undefined);
    check('scanEnvExposure safetyMarkers.sourceMutation === false', result.safetyMarkers.sourceMutation === false);
    check('scanEnvExposure safetyMarkers.productionActivationEnabled === false', result.safetyMarkers.productionActivationEnabled === false);

    return svc.evaluateComplianceGuardrails({ actor: 'smoke-test' });
  }).then(result => {
    check('evaluateComplianceGuardrails returns reviewOnly: true', result.reviewOnly === true);
    check('evaluateComplianceGuardrails has guardrails array', Array.isArray(result.guardrails));
    check('All guardrails ENFORCED', result.guardrails.every(g => g.status === 'ENFORCED'));
    check('No guardrail has paymentExecutionEnabled: true', result.guardrails.every(g => !g.payment_execution_enabled));
    check('No guardrail has productionActivationEnabled: true', result.guardrails.every(g => !g.production_activation_enabled));

    return svc.buildSecurityComplianceEvidencePack({ actor: 'smoke-test' });
  }).then(pack => {
    check('Evidence pack has safety_invariants', pack.safety_invariants !== undefined);
    check('Evidence pack PRODUCTION_ACTIVATION is NOT_ENABLED', pack.safety_invariants.PRODUCTION_ACTIVATION === 'NOT_ENABLED');
    check('Evidence pack PAYMENT_EXECUTION is NOT_ENABLED', pack.safety_invariants.PAYMENT_EXECUTION === 'NOT_ENABLED');
    check('Evidence pack SOURCE_RECORD_MUTATION is NOT_ENABLED', pack.safety_invariants.SOURCE_RECORD_MUTATION === 'NOT_ENABLED');
    check('Evidence pack reviewOnly: true', pack.reviewOnly === true);

    console.log(`\nPhase 119B Service Smoke: PASS=${pass} FAIL=${fail}\n`);
    if (fail > 0) process.exit(1);
  }).catch(err => {
    console.error('Runtime async error:', err.message);
    process.exit(1);
  });
} catch (err) {
  console.error('Service load error:', err.message);
  process.exit(1);
}
