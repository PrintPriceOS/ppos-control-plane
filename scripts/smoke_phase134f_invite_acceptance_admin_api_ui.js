'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

(async () => {
  console.log('=== Smoke 134F: Invite Acceptance Admin API & UI ===');

  // Verify Admin Router mounted
  const adminRoutesPath = path.join(__dirname, '../src/api/routes/admin.js');
  const adminCode = fs.readFileSync(adminRoutesPath, 'utf8');
  assert(adminCode.includes("controlledBetaInviteAcceptanceAdmin"), "controlledBetaInviteAcceptanceAdmin imported in admin.js");
  assert(adminCode.includes("/beta/invite-acceptance"), "controlledBetaInviteAcceptanceAdmin mounted at /beta/invite-acceptance");

  // Verify UI Client exists
  const clientPath = path.join(__dirname, '../src/ui/api/controlledBetaInviteAcceptanceClient.ts');
  assert(fs.existsSync(clientPath), "UI API Client file exists");

  // Verify UI Page exists
  const pagePath = path.join(__dirname, '../src/ui/pages/beta/ControlledBetaInviteAcceptance.tsx');
  assert(fs.existsSync(pagePath), "UI React page component file exists");

  // Verify warnings and safety constraints in UI Page
  const pageCode = fs.readFileSync(pagePath, 'utf8');
  assert(pageCode.includes("Controlled invite acceptance and participant onboarding only"), "UI contains warning banner copy");
  assert(pageCode.includes("This is not public signup, not public beta, and not open marketplace"), "UI explicitly states restrictions");
  assert(!pageCode.includes("invite_code") && !pageCode.includes("invite_token") && !pageCode.includes("rawCode"), "UI does not leak raw codes or tokens");

  // Verify route registered in App.tsx
  const appPath = path.join(__dirname, '../src/ui/App.tsx');
  const appCode = fs.readFileSync(appPath, 'utf8');
  assert(appCode.includes("/admin/beta/invite-acceptance"), "App.tsx routes to /admin/beta/invite-acceptance");

  // Verify nav item
  const navPath = path.join(__dirname, '../src/ui/config/controlPlaneNavigation.ts');
  const navCode = fs.readFileSync(navPath, 'utf8');
  assert(navCode.includes("beta-invite-acceptance"), "Navigation config contains beta-invite-acceptance item");

  console.log(`Smoke 134F: Finished. Passed: ${passed}, Failed: ${failed}\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
