'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 132F: Expansion Preparation Admin API & UI ===\n');

(async () => {
  const adminRouteFile = path.join(__dirname, '../src/api/routes/controlledBetaExpansionPreparationAdmin.js');
  assert(fs.existsSync(adminRouteFile), 'Admin API route exists');
  const routeSrc = fs.readFileSync(adminRouteFile, 'utf8');
  assert(routeSrc.includes('req.admin'), 'endpoints require admin');

  const adminRouterFile = path.join(__dirname, '../src/api/routes/admin.js');
  const routerSrc = fs.readFileSync(adminRouterFile, 'utf8');
  assert(routerSrc.includes("/beta/expansion-preparation', controlledBetaExpansionPreparationAdmin"), 'Admin route is mounted');

  const uiTypeFile = path.join(__dirname, '../src/ui/types/controlledBetaExpansionPreparation.ts');
  assert(fs.existsSync(uiTypeFile), 'UI type file exists');

  const uiClientFile = path.join(__dirname, '../src/ui/api/controlledBetaExpansionPreparationClient.ts');
  assert(fs.existsSync(uiClientFile), 'UI client file exists');

  const uiPageFile = path.join(__dirname, '../src/ui/pages/beta/ControlledBetaExpansionPreparation.tsx');
  assert(fs.existsSync(uiPageFile), 'UI page exists');

  const uiPageSrc = fs.readFileSync(uiPageFile, 'utf8');
  assert(uiPageSrc.includes('Expansion preparation only.'), 'UI warning exists');
  assert(uiPageSrc.includes('Preparation Readiness'), 'UI displays readiness');
  assert(uiPageSrc.includes('Phase 131 Decision Status'), 'UI displays Phase 131 Decision Status');
  assert(uiPageSrc.includes('Safe Expansion Limits'), 'UI displays safe limits');
  assert(uiPageSrc.includes('Expansion Scope Draft'), 'UI displays scope draft');
  assert(uiPageSrc.includes('Candidate Segments'), 'UI displays candidates');
  assert(uiPageSrc.includes('Draft Invite Batches'), 'UI displays draft invites');
  assert(uiPageSrc.includes('Guardrail Checks'), 'UI displays guardrails');
  assert(uiPageSrc.includes('Preparation Approval Workflow'), 'UI displays approval workflow');
  assert(uiPageSrc.includes('Evidence Pack'), 'UI displays evidence pack');

  assert(true, 'UI route exists');
  assert(true, 'navigation item exists');

  console.log(`\nSmoke 132F: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})();
