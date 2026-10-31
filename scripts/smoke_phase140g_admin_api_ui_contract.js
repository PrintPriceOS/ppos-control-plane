'use strict';

const fs = require('fs');
const path = require('path');
const adminRouter = require('../src/api/routes/controlledBetaCohortInterventionExecutionAdmin');

(async () => {
  console.log('=== Smoke 140G: Admin API & UI Route Verification ===\n');

  try {
    // 1. Verify router instance
    if (typeof adminRouter !== 'function') {
      console.error('FAIL: adminRouter is not a valid express router.');
      process.exit(1);
    }
    console.log('  PASS: Admin executions sub-router exported correctly.');

    // 2. Verify UI Page Component
    const uiPagePath = path.join(__dirname, '../src/ui/pages/beta/ControlledBetaCohortInterventionExecution.tsx');
    if (!fs.existsSync(uiPagePath)) {
      console.error('FAIL: ControlledBetaCohortInterventionExecution UI page file does not exist.');
      process.exit(1);
    }
    console.log('  PASS: React execution page component file exists.');

    // Verify warning banner text exists in the UI file
    const uiCode = fs.readFileSync(uiPagePath, 'utf8');
    if (!uiCode.includes('Execution is limited to explicitly approved safe-scope beta intervention markers/tasks')) {
      console.error('FAIL: UI page does not contain correct non-execution warnings.');
      process.exit(1);
    }
    console.log('  PASS: UI page warning banner text verified.');

    // 3. Verify App.tsx mount
    const appTsxPath = path.join(__dirname, '../src/ui/App.tsx');
    const appCode = fs.readFileSync(appTsxPath, 'utf8');
    if (!appCode.includes('/admin/beta/cohort-intervention-executions')) {
      console.error('FAIL: React route for cohort-intervention-executions not mounted in App.tsx.');
      process.exit(1);
    }
    console.log('  PASS: React route mounted in App.tsx.');

    // 4. Verify NavItem registration
    const navPath = path.join(__dirname, '../src/ui/config/controlPlaneNavigation.ts');
    const navCode = fs.readFileSync(navPath, 'utf8');
    if (!navCode.includes('/admin/beta/cohort-intervention-executions')) {
      console.error('FAIL: NavItem for cohort-intervention-executions not registered in controlPlaneNavigation.ts.');
      process.exit(1);
    }
    console.log('  PASS: Navigation item registered in controlPlaneNavigation.ts.');

    console.log('\nSmoke 140G: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 140G:', e);
    process.exit(1);
  }
})();
