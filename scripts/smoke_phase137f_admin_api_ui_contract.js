'use strict';

const fs = require('fs');
const path = require('path');
const adminRouter = require('../src/api/routes/controlledBetaRuntimeActivityReviewAdmin');

(async () => {
  console.log('=== Smoke 137F: Admin API & UI Route Verification ===\n');

  try {
    // 1. Verify router instance
    if (typeof adminRouter !== 'function') {
      console.error('FAIL: adminRouter is not a valid express router.');
      process.exit(1);
    }
    console.log('  PASS: Admin reviews sub-router exported correctly.');

    // 2. Verify UI Page Component
    const uiPagePath = path.join(__dirname, '../src/ui/pages/beta/ControlledBetaRuntimeActivityReview.tsx');
    if (!fs.existsSync(uiPagePath)) {
      console.error('FAIL: ControlledBetaRuntimeActivityReview UI page file does not exist.');
      process.exit(1);
    }
    console.log('  PASS: React review page component file exists.');

    // 3. Verify App.tsx mount
    const appTsxPath = path.join(__dirname, '../src/ui/App.tsx');
    const appCode = fs.readFileSync(appTsxPath, 'utf8');
    if (!appCode.includes('/admin/beta/runtime-reviews')) {
      console.error('FAIL: React route for runtime-reviews not mounted in App.tsx.');
      process.exit(1);
    }
    console.log('  PASS: React route mounted in App.tsx.');

    // 4. Verify NavItem registration
    const navPath = path.join(__dirname, '../src/ui/config/controlPlaneNavigation.ts');
    const navCode = fs.readFileSync(navPath, 'utf8');
    if (!navCode.includes('/admin/beta/runtime-reviews')) {
      console.error('FAIL: NavItem for runtime-reviews not registered in controlPlaneNavigation.ts.');
      process.exit(1);
    }
    console.log('  PASS: Navigation item registered in controlPlaneNavigation.ts.');

    console.log('\nSmoke 137F: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 137F:', e);
    process.exit(1);
  }
})();
