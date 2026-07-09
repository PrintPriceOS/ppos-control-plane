'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

(() => {
  console.log('=== Smoke 174F: Admin API & UI Contract Verification ===');

  const adminJsPath = path.join(__dirname, '..', 'src', 'api', 'routes', 'admin.js');
  const adminJsContent = fs.readFileSync(adminJsPath, 'utf8');

  assert.ok(adminJsContent.includes('controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockComplianceWitnessAdmin'), 'Admin route import missing in admin.js');
  assert.ok(adminJsContent.includes('/beta/cohort-intervention/activation-token-redemption-unlock-compliance-witness'), 'Admin route mount path missing in admin.js');
  console.log('  PASS: Phase 174 router imported and mounted in admin.js.');

  const clientPath = path.join(__dirname, '..', 'src', 'ui', 'lib', 'controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockComplianceWitnessClient.ts');
  const clientContent = fs.readFileSync(clientPath, 'utf8');

  assert.ok(clientContent.includes('getUnlockComplianceWitnessList'), 'Client method getUnlockComplianceWitnessList missing');
  assert.ok(clientContent.includes('getUnlockComplianceWitnessDetails'), 'Client method getUnlockComplianceWitnessDetails missing');
  assert.ok(clientContent.includes('createUnlockComplianceWitness'), 'Client method createUnlockComplianceWitness missing');
  assert.ok(clientContent.includes('evaluateUnlockComplianceWitness'), 'Client method evaluateUnlockComplianceWitness missing');
  assert.ok(clientContent.includes('recordDecision'), 'Client method recordDecision missing');
  assert.ok(clientContent.includes('finalizeUnlockComplianceWitness'), 'Client method finalizeUnlockComplianceWitness missing');
  console.log('  PASS: Client library methods verified.');

  const uiPagePath = path.join(__dirname, '..', 'src', 'ui', 'pages', 'beta', 'ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockComplianceWitness.tsx');
  const uiPageContent = fs.readFileSync(uiPagePath, 'utf8');

  assert.ok(uiPageContent.includes('This phase records independent compliance witness attestation only.'), 'Missing UI non-execution warning banner');
  console.log('  PASS: UI Page contains the non-execution warning banner.');

  const appTxPath = path.join(__dirname, '..', 'src', 'ui', 'App.tsx');
  const appTxContent = fs.readFileSync(appTxPath, 'utf8');

  assert.ok(appTxContent.includes('/admin/beta/cohort-intervention/activation-token-redemption-unlock-compliance-witness/:unlockComplianceWitnessId'), 'UI Route missing in App.tsx');
  console.log('  PASS: UI Page route registered matching user recommendation.');

  console.log('\nSmoke 174F: Passed.');
  process.exit(0);
})();
