'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

(() => {
  console.log('=== Smoke 175F: Admin API & UI Contract Verification ===');

  const adminJsPath = path.join(__dirname, '..', 'src', 'api', 'routes', 'admin.js');
  const adminJsContent = fs.readFileSync(adminJsPath, 'utf8');

  assert.ok(adminJsContent.includes('controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersignAdmin'), 'Admin route import missing in admin.js');
  assert.ok(adminJsContent.includes('/beta/cohort-intervention/activation-token-redemption-unlock-risk-officer-countersign'), 'Admin route mount path missing in admin.js');
  console.log('  PASS: Phase 175 router imported and mounted in admin.js.');

  const clientPath = path.join(__dirname, '..', 'src', 'ui', 'lib', 'controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersignClient.ts');
  const clientContent = fs.readFileSync(clientPath, 'utf8');

  assert.ok(clientContent.includes('getUnlockRiskOfficerCountersignList'), 'Client method getUnlockRiskOfficerCountersignList missing');
  assert.ok(clientContent.includes('getUnlockRiskOfficerCountersignDetails'), 'Client method getUnlockRiskOfficerCountersignDetails missing');
  assert.ok(clientContent.includes('createUnlockRiskOfficerCountersign'), 'Client method createUnlockRiskOfficerCountersign missing');
  assert.ok(clientContent.includes('evaluateUnlockRiskOfficerCountersign'), 'Client method evaluateUnlockRiskOfficerCountersign missing');
  assert.ok(clientContent.includes('recordDecision'), 'Client method recordDecision missing');
  assert.ok(clientContent.includes('finalizeUnlockRiskOfficerCountersign'), 'Client method finalizeUnlockRiskOfficerCountersign missing');
  console.log('  PASS: Client library methods verified.');

  const uiPagePath = path.join(__dirname, '..', 'src', 'ui', 'pages', 'beta', 'ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersign.tsx');
  const uiPageContent = fs.readFileSync(uiPagePath, 'utf8');

  assert.ok(uiPageContent.includes('This phase records independent Risk Officer countersign only.'), 'Missing UI non-execution warning banner');
  console.log('  PASS: UI Page contains the non-execution warning banner.');

  const appTxPath = path.join(__dirname, '..', 'src', 'ui', 'App.tsx');
  const appTxContent = fs.readFileSync(appTxPath, 'utf8');

  assert.ok(appTxContent.includes('/admin/beta/cohort-intervention/activation-token-redemption-unlock-risk-officer-countersign/:unlockRiskOfficerCountersignId'), 'UI Route missing in App.tsx');
  console.log('  PASS: UI Page route registered matching user recommendation.');

  console.log('\nSmoke 175F: Passed.');
  process.exit(0);
})();
