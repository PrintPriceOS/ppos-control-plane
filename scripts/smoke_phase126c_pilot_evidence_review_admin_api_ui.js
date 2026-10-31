'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Phase 126C: Pilot Evidence Review Admin API / UI Smoke ===\n');

// --- Route file ---
const routePath = path.join(__dirname, '..', 'src', 'api', 'routes', 'pilotEvidenceReviewGoNoGoAdmin.js');
assert(fs.existsSync(routePath), 'Route file exists');
if (fs.existsSync(routePath)) {
  const routeSrc = fs.readFileSync(routePath, 'utf8');
  assert(routeSrc.includes("requireAdmin"), 'Route uses requireAdmin');
  assert(routeSrc.includes("'/readiness'"), 'Route has /readiness endpoint');
  assert(routeSrc.includes("'/create'"), 'Route has /create endpoint');
  assert(routeSrc.includes("'/aggregate'"), 'Route has /aggregate endpoint');
  assert(routeSrc.includes("'/finding'"), 'Route has /finding endpoint');
  assert(routeSrc.includes("'/resolve-finding'"), 'Route has /resolve-finding endpoint');
  assert(routeSrc.includes("'/decision'"), 'Route has /decision endpoint');
  assert(routeSrc.includes("'/audit-timeline'"), 'Route has /audit-timeline endpoint');
  assert(routeSrc.includes("'/evidence-pack'"), 'Route has /evidence-pack endpoint');
  assert(routeSrc.includes('fullPublicEnabled: false'), 'Route: fullPublicEnabled=false');
  assert(routeSrc.includes('betaEnabled: false'), 'Route: betaEnabled=false');
  assert(routeSrc.includes('paymentExecutionEnabled: false'), 'Route: paymentExecutionEnabled=false');
  assert(routeSrc.includes('productionActivationEnabled: false'), 'Route: productionActivationEnabled=false');
}

// --- Admin.js mount ---
const adminPath = path.join(__dirname, '..', 'src', 'api', 'routes', 'admin.js');
if (fs.existsSync(adminPath)) {
  const adminSrc = fs.readFileSync(adminPath, 'utf8');
  assert(adminSrc.includes("pilotEvidenceReviewGoNoGoAdmin"), 'admin.js imports pilotEvidenceReviewGoNoGoAdmin');
  assert(adminSrc.includes("'/production/pilot-evidence-review'"), 'admin.js mounts /production/pilot-evidence-review');
}

// --- UI Types ---
const typesPath = path.join(__dirname, '..', 'src', 'ui', 'types', 'pilotEvidenceReviewGoNoGo.ts');
assert(fs.existsSync(typesPath), 'UI types file exists');
if (fs.existsSync(typesPath)) {
  const typesSrc = fs.readFileSync(typesPath, 'utf8');
  assert(typesSrc.includes('PilotEvidenceReviewSafetyMarkers'), 'Types has PilotEvidenceReviewSafetyMarkers');
  assert(typesSrc.includes('PilotEvidenceReviewBoard'), 'Types has PilotEvidenceReviewBoard');
  assert(typesSrc.includes('PilotEvidenceReviewCheck'), 'Types has PilotEvidenceReviewCheck');
  assert(typesSrc.includes('PilotEvidenceReviewFinding'), 'Types has PilotEvidenceReviewFinding');
  assert(typesSrc.includes('PilotEvidenceGoNoGoDecision'), 'Types has PilotEvidenceGoNoGoDecision');
  assert(typesSrc.includes('PilotEvidenceReviewAudit'), 'Types has PilotEvidenceReviewAudit');
  assert(typesSrc.includes('PilotEvidenceReviewPack'), 'Types has PilotEvidenceReviewPack');
  assert(typesSrc.includes('betaEnabled'), 'Types has betaEnabled');
}

// --- UI Client ---
const clientPath = path.join(__dirname, '..', 'src', 'ui', 'api', 'pilotEvidenceReviewGoNoGoClient.ts');
assert(fs.existsSync(clientPath), 'UI client file exists');
if (fs.existsSync(clientPath)) {
  const clientSrc = fs.readFileSync(clientPath, 'utf8');
  assert(clientSrc.includes('/api/admin/production/pilot-evidence-review'), 'Client has correct base URL');
  assert(clientSrc.includes('getPilotEvidenceReviewReadiness'), 'Client has getPilotEvidenceReviewReadiness');
  assert(clientSrc.includes('createReviewBoard'), 'Client has createReviewBoard');
  assert(clientSrc.includes('aggregatePilotEvidence'), 'Client has aggregatePilotEvidence');
  assert(clientSrc.includes('recordReviewFinding'), 'Client has recordReviewFinding');
  assert(clientSrc.includes('resolveReviewFinding'), 'Client has resolveReviewFinding');
  assert(clientSrc.includes('submitGoNoGoDecision'), 'Client has submitGoNoGoDecision');
  assert(clientSrc.includes('getPilotReviewAuditTimeline'), 'Client has getPilotReviewAuditTimeline');
  assert(clientSrc.includes('getPilotReviewEvidencePack'), 'Client has getPilotReviewEvidencePack');
}

// --- UI Page ---
const pagePath = path.join(__dirname, '..', 'src', 'ui', 'pages', 'production', 'PilotEvidenceReviewGoNoGo.tsx');
assert(fs.existsSync(pagePath), 'UI page file exists');
if (fs.existsSync(pagePath)) {
  const pageSrc = fs.readFileSync(pagePath, 'utf8');
  assert(pageSrc.includes('PilotEvidenceReviewGoNoGo'), 'Page exports PilotEvidenceReviewGoNoGo');
  assert(pageSrc.includes('SAFETY_NOTICE'), 'Page has SAFETY_NOTICE');
  assert(pageSrc.includes('NOT_ENABLED'), 'Page shows NOT_ENABLED flags');
  assert(pageSrc.includes('BETA_ENABLED'), 'Page shows BETA_ENABLED flag');
  assert(pageSrc.includes('Go/No-Go'), 'Page mentions Go/No-Go');
  assert(pageSrc.includes('does NOT enable limited beta'), 'Page warns beta not auto-enabled');
  assert(pageSrc.includes('NO_GO'), 'Page has NO_GO option');
  assert(pageSrc.includes('GO_FOR_LIMITED_BETA_PREPARATION'), 'Page has GO option');
  assert(pageSrc.includes('DEFERRED'), 'Page has DEFERRED option');
  assert(pageSrc.includes('CHANGES_REQUIRED'), 'Page has CHANGES_REQUIRED option');
}

// --- App.tsx route ---
const appPath = path.join(__dirname, '..', 'src', 'ui', 'App.tsx');
if (fs.existsSync(appPath)) {
  const appSrc = fs.readFileSync(appPath, 'utf8');
  assert(appSrc.includes("PilotEvidenceReviewGoNoGo"), 'App.tsx imports PilotEvidenceReviewGoNoGo');
  assert(appSrc.includes('/admin/production/pilot-evidence-review'), 'App.tsx has pilot-evidence-review route');
}

console.log(`\nPhase 126C Admin API / UI: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
