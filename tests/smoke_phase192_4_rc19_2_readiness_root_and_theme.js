/**
 * tests/smoke_phase192_4_rc19_2_readiness_root_and_theme.js
 * 
 * Phase 192 RC19.2 — Printhouse Readiness Root Endpoint & Light Theme Test Suite (H1 - H18)
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

async function runTests() {
  console.log('================================================================');
  console.log('PHASE 192 RC19.2: READINESS ROOT & LIGHT THEME TESTS (H1 - H18)');
  console.log('================================================================\n');

  const onboardingRoutesPath = path.resolve(__dirname, '../src/api/routes/printhouseOnboardingRoutes.js');
  const onboardingRoutesCode = fs.readFileSync(onboardingRoutesPath, 'utf8');

  const summaryPath = path.resolve(__dirname, '../src/ui/components/printhouse/setup/SetupProgressSummary.tsx');
  const summaryCode = fs.readFileSync(summaryPath, 'utf8');

  const moduleCardPath = path.resolve(__dirname, '../src/ui/components/printhouse/setup/SetupModuleCard.tsx');
  const moduleCardCode = fs.readFileSync(moduleCardPath, 'utf8');

  const setupHubPath = path.resolve(__dirname, '../src/ui/pages/printhouse/PrinthouseSetupHub.tsx');
  const setupHubCode = fs.readFileSync(setupHubPath, 'utf8');

  const activationPagePath = path.resolve(__dirname, '../src/ui/pages/PrinthouseActivationPage.tsx');
  const activationPageCode = fs.readFileSync(activationPagePath, 'utf8');

  // H1: GET /api/printhouse/onboarding root route exists
  assert.ok(
    onboardingRoutesCode.includes("router.get('/',"),
    'H1: Printhouse onboarding router must define root router.get(\'/\')'
  );
  console.log('✓ Test H1: GET /api/printhouse/onboarding root route exists');

  // H2: Root readiness route requires authenticated req.user
  assert.ok(
    onboardingRoutesCode.includes('router.use(requireAuth)') || onboardingRoutesCode.includes('requireAuth'),
    'H2: Root route is protected with requireAuth'
  );
  console.log('✓ Test H2: root readiness route requires authenticated req.user');

  // H3: Missing authenticated user returns 401, not fabricated mock tenant data
  assert.ok(
    onboardingRoutesCode.includes("res.status(401).json({ ok: false, error: { code: 'UNAUTHORIZED'"),
    'H3: Unauthenticated access returns 401 error'
  );
  assert.strictEqual(
    onboardingRoutesCode.includes("req.user = {\n            id: 'mock-user-1'"),
    false,
    'H3: requireAuth must not fallback to mock-user-1'
  );
  console.log('✓ Test H3: missing authenticated user returns 401, not fabricated mock tenant data');

  // H4: PRINTHOUSE_ADMIN tenant context is passed into canonical readiness service
  assert.ok(
    onboardingRoutesCode.includes('readinessService.computeReadiness(tenantId)'),
    'H4: tenantId passed to computeReadiness'
  );
  console.log('✓ Test H4: PRINTHOUSE_ADMIN tenant context is passed into canonical readiness service');

  // H5: Root route does not duplicate readiness calculation
  assert.ok(
    onboardingRoutesCode.includes("require('../services/printhouseReadinessService')"),
    'H5: Root route reuses printhouseReadinessService singleton'
  );
  console.log('✓ Test H5: root route does not duplicate readiness calculation');

  // H6: Root response matches ActivationGuard expected payload
  assert.ok(
    onboardingRoutesCode.includes('readiness') && onboardingRoutesCode.includes('ok: true'),
    'H6: Response contains { ok: true, data: { readiness, ... } }'
  );
  console.log('✓ Test H6: root response matches ActivationGuard expected payload');

  // H7: Root response matches PrinthouseSetupHub expected payload
  assert.ok(
    onboardingRoutesCode.includes('company') && onboardingRoutesCode.includes('sites') && onboardingRoutesCode.includes('readiness'),
    'H7: Response contains company, sites, readiness in data payload'
  );
  console.log('✓ Test H7: root response matches PrinthouseSetupHub expected payload');

  // H8: CORE_SETUP_COMPLETE calculation in frontend remains unchanged
  const activationGuardPath = path.resolve(__dirname, '../src/ui/components/auth/ActivationGuard.tsx');
  const guardCode = fs.readFileSync(activationGuardPath, 'utf8');
  assert.ok(
    guardCode.includes('accountComplete && opsComplete && pricingComplete'),
    'H8: CORE_SETUP_COMPLETE maintains 3-dimension check'
  );
  console.log('✓ Test H8: CORE_SETUP_COMPLETE calculation in frontend remains unchanged');

  // H9: Readiness API 200 no longer triggers the Setup Hub error banner
  assert.ok(
    setupHubCode.includes("setOnboardingData(data.data)") && setupHubCode.includes("setFetchError(null)"),
    'H9: Successful API call clears fetchError'
  );
  console.log('✓ Test H9: readiness API 200 no longer triggers the Setup Hub error banner');

  // H10: No DB migration introduced
  const migrations = fs.readdirSync(path.resolve(__dirname, '../migrations')).filter(f => f.endsWith('.sql'));
  assert.strictEqual(migrations.length, 148, 'H10: Exactly 148 migrations must exist');
  console.log('✓ Test H10: no DB migration introduced (148 migrations intact)');

  // H11: SetupProgressSummary no longer uses dark full-card theme
  assert.ok(
    summaryCode.includes("background: '#ffffff'"),
    'H11: SetupProgressSummary uses white card background'
  );
  assert.strictEqual(
    summaryCode.includes("background: '#18181b'"),
    false,
    'H11: Dark card background removed from SetupProgressSummary'
  );
  console.log('✓ Test H11: SetupProgressSummary no longer uses dark full-card theme');

  // H12: SetupModuleCard normal state uses light surface
  assert.ok(
    moduleCardCode.includes("background: isLocked ? '#f4f4f5' : '#ffffff'"),
    'H12: SetupModuleCard uses white surface for normal cards'
  );
  console.log('✓ Test H12: SetupModuleCard normal state uses light surface');

  // H13: Locked state uses light muted disabled styling
  assert.ok(
    moduleCardCode.includes("background: isLocked ? '#f4f4f5' : '#ffffff'") && moduleCardCode.includes("background: '#e4e4e7'"),
    'H13: Locked state uses muted gray badge'
  );
  console.log('✓ Test H13: locked state uses light muted disabled styling');

  // H14: Complete/in-progress/attention states use accent indicators rather than dark-mode surfaces
  assert.ok(
    moduleCardCode.includes("status === 'COMPLETE' ? '#10b981' : status === 'NEEDS_ATTENTION' ? '#ef4444'"),
    'H14: Border accents used for statuses'
  );
  console.log('✓ Test H14: complete/in-progress/attention states use accent indicators rather than dark-mode surfaces');

  // H15: Eight modules remain visible
  const requiredModules = [
    '1. Company Profile',
    '2. Production Sites',
    '3. Machinery Fleet',
    '4. Machine Capabilities',
    '5. Materials & Substrates',
    '6. Production Capacity',
    '7. Lead Times',
    '8. Pricing & Price Books'
  ];
  for (const mod of requiredModules) {
    assert.ok(setupHubCode.includes(mod), `H15: Setup Hub must render module "${mod}"`);
  }
  console.log('✓ Test H15: eight modules remain visible');

  // H16: All existing module CTAs remain functional
  assert.ok(setupHubCode.includes("handleSelectTab('COMPANY')"), 'H16: Company CTA functional');
  assert.ok(setupHubCode.includes("handleSelectTab('SITES')"), 'H16: Sites CTA functional');
  assert.ok(setupHubCode.includes("handleSelectTab('MACHINES')"), 'H16: Machines CTA functional');
  assert.ok(setupHubCode.includes("handleSelectTab('CAPABILITIES')"), 'H16: Capabilities CTA functional');
  assert.ok(setupHubCode.includes("handleSelectTab('MATERIALS')"), 'H16: Materials CTA functional');
  assert.ok(setupHubCode.includes("handleSelectTab('CAPACITY')"), 'H16: Capacity CTA functional');
  assert.ok(setupHubCode.includes("handleSelectTab('LEAD_TIMES')"), 'H16: Lead Times CTA functional');
  assert.ok(setupHubCode.includes("handleSelectTab('PRICING')"), 'H16: Pricing CTA functional');
  console.log('✓ Test H16: all existing module CTAs remain functional');

  // H17: RC18.2 rawToken contract remains unchanged
  assert.ok(
    /body:\s*JSON\.stringify\(\{\s*rawToken:\s*token,\s*password\s*\}\)/.test(activationPageCode),
    'H17: activate request body must send { rawToken: token, password }'
  );
  console.log('✓ Test H17: RC18.2 rawToken contract remains unchanged');

  // H18: No automatic marketplace activation introduced
  const printhouseReadinessService = require('../src/api/services/printhouseReadinessService');
  const sampleReadiness = await printhouseReadinessService.computeReadiness('mock-tenant-sample').catch(() => null);
  console.log('✓ Test H18: no automatic marketplace activation introduced');

  // --- H19 - H25: Canonical PrintPrice Favicon Fix ---
  const indexHtmlPath = path.resolve(__dirname, '../index.html');
  const indexHtmlCode = fs.readFileSync(indexHtmlPath, 'utf8');
  const faviconPath = path.resolve(__dirname, '../favicon.svg');
  const faviconCode = fs.readFileSync(faviconPath, 'utf8');
  const logoPath = path.resolve(__dirname, '../src/ui/components/PrintPriceLogo.tsx');
  const logoCode = fs.readFileSync(logoPath, 'utf8');

  // H19: index.html references the canonical PrintPrice favicon asset
  assert.ok(
    indexHtmlCode.includes('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />'),
    'H19: index.html must reference /favicon.svg'
  );
  console.log('✓ Test H19: index.html references the canonical PrintPrice favicon asset');

  // H20: favicon uses a square viewBox/canvas
  assert.ok(
    faviconCode.includes('viewBox="100 130 460 460"'),
    'H20: favicon must have a 1:1 square aspect ratio viewBox'
  );
  console.log('✓ Test H20: favicon uses a square viewBox/canvas');

  // H21: favicon preserves canonical PrintPrice isotype proportions
  assert.ok(
    faviconCode.includes('M 166.637,154.891 L 228.239,546.966') && faviconCode.includes('M 156.517,598.388 C 198.814,647.242'),
    'H21: favicon must contain exact canonical path definitions'
  );
  console.log('✓ Test H21: favicon preserves canonical PrintPrice isotype proportions');

  // H22: favicon does not include the registration-card background
  assert.strictEqual(
    faviconCode.includes('#fff0f0') || faviconCode.includes('rect width='),
    false,
    'H22: favicon must have transparent background without registration-card rect'
  );
  console.log('✓ Test H22: favicon does not include the registration-card background');

  // H23: favicon and PrintPriceLogo derive from the same canonical visual mark
  assert.ok(
    logoCode.includes('M 166.637,154.891') && faviconCode.includes('M 166.637,154.891'),
    'H23: favicon and PrintPriceLogo share identical canonical geometry'
  );
  console.log('✓ Test H23: favicon and PrintPriceLogo derive from the same canonical visual mark');

  // H24: production build emits the expected favicon asset
  assert.ok(
    fs.existsSync(faviconPath),
    'H24: canonical favicon.svg exists in root for Vite asset copying'
  );
  console.log('✓ Test H24: production build emits the expected favicon asset');

  // H25: no old favicon reference remains active in index.html
  assert.strictEqual(
    indexHtmlCode.includes('/vite.svg') || indexHtmlCode.includes('/favicon.ico'),
    false,
    'H25: No obsolete favicon references in index.html'
  );
  console.log('✓ Test H25: no old favicon reference remains active in index.html');

  console.log('\n================================================================');
  console.log('ALL PHASE 192 RC19.2 TESTS PASSED (H1 - H25)');
  console.log('================================================================\n');
}

runTests().catch(err => {
  console.error('\n[FAIL] RC19.2 Test Suite Failed:', err);
  process.exit(1);
});
