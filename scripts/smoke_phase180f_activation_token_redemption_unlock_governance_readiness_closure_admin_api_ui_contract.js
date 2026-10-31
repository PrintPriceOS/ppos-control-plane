'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

(() => {
  console.log('=== Smoke 180F: Phase 180 Admin API & UI Contract Verification ===');

  const rootDir = path.join(__dirname, '..');

  // Verify route mount
  const adminRoutesPath = path.join(rootDir, 'src', 'api', 'routes', 'admin.js');
  const adminRoutesContent = fs.readFileSync(adminRoutesPath, 'utf8');
  assert.ok(adminRoutesContent.includes('controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosureAdmin'), 'admin.js must mount Phase 180 router');
  console.log('  PASS: admin.js routing integration verified.');

  // Verify UI route mount
  const appTsxPath = path.join(rootDir, 'src', 'ui', 'App.tsx');
  const appTsxContent = fs.readFileSync(appTsxPath, 'utf8');
  assert.ok(appTsxContent.includes('/admin/beta/cohort-intervention/activation-token-redemption-unlock-governance-readiness-closure'), 'App.tsx must define routing paths for Phase 180 page component');
  console.log('  PASS: App.tsx routing integration verified.');

  // Verify UI React component
  const reactComponentPath = path.join(rootDir, 'src', 'ui', 'pages', 'beta', 'ControlledBetaCohortInterventionSimulationExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosure.tsx');
  assert.ok(fs.existsSync(reactComponentPath), 'React component page file must exist');
  const reactContent = fs.readFileSync(reactComponentPath, 'utf8');
  assert.ok(reactContent.includes('This phase closes governance readiness only.'), 'React page must contain safety warning message banner');
  console.log('  PASS: UI React page component verified.');

  console.log('\nSmoke 180F: Passed.');
  process.exit(0);
})();
