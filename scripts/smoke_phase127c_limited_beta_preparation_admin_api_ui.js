'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Phase 127C: Limited Beta Preparation Gate Admin API / UI Smoke ===\n');

// --- Route file ---
const routePath = path.join(__dirname, '..', 'src', 'api', 'routes', 'limitedBetaPreparationGateAdmin.js');
assert(fs.existsSync(routePath), 'Route file exists');
if (fs.existsSync(routePath)) {
  const routeSrc = fs.readFileSync(routePath, 'utf8');
  assert(routeSrc.includes("requireAdmin"), 'Route uses requireAdmin');
  assert(routeSrc.includes("'/readiness'"), 'Route has /readiness endpoint');
  assert(routeSrc.includes("'/gate/create'"), 'Route has /gate/create endpoint');
  assert(routeSrc.includes("'/cohort/create'"), 'Route has /cohort/create endpoint');
  assert(routeSrc.includes("'/participant/register'"), 'Route has /participant/register endpoint');
  assert(routeSrc.includes("'/invite/issue'"), 'Route has /invite/issue endpoint');
  assert(routeSrc.includes("'/invite/revoke'"), 'Route has /invite/revoke endpoint');
  assert(routeSrc.includes("'/terms/acceptance'"), 'Route has /terms/acceptance endpoint');
  assert(routeSrc.includes("'/role-boundary'"), 'Route has /role-boundary endpoint');
  assert(routeSrc.includes("'/support-escalation'"), 'Route has /support-escalation endpoint');
  assert(routeSrc.includes("'/incident-rollback-plan'"), 'Route has /incident-rollback-plan endpoint');
  assert(routeSrc.includes("'/finding'"), 'Route has /finding endpoint');
  assert(routeSrc.includes("'/resolve-finding'"), 'Route has /resolve-finding endpoint');
  assert(routeSrc.includes("'/audit-timeline'"), 'Route has /audit-timeline endpoint');
  assert(routeSrc.includes("'/evidence-pack'"), 'Route has /evidence-pack endpoint');
  assert(routeSrc.includes('betaRuntimeEnabled: false'), 'Route: betaRuntimeEnabled=false');
  assert(routeSrc.includes('fullPublicEnabled: false'), 'Route: fullPublicEnabled=false');
  assert(routeSrc.includes('paymentExecutionEnabled: false'), 'Route: paymentExecutionEnabled=false');
}

// --- Admin.js mount ---
const adminPath = path.join(__dirname, '..', 'src', 'api', 'routes', 'admin.js');
if (fs.existsSync(adminPath)) {
  const adminSrc = fs.readFileSync(adminPath, 'utf8');
  assert(adminSrc.includes("limitedBetaPreparationGateAdmin"), 'admin.js imports limitedBetaPreparationGateAdmin');
  assert(adminSrc.includes("'/beta/preparation-gate'"), 'admin.js mounts /beta/preparation-gate');
}

// --- UI Types ---
const typesPath = path.join(__dirname, '..', 'src', 'ui', 'types', 'limitedBetaPreparationGate.ts');
assert(fs.existsSync(typesPath), 'UI types file exists');
if (fs.existsSync(typesPath)) {
  const typesSrc = fs.readFileSync(typesPath, 'utf8');
  assert(typesSrc.includes('LimitedBetaPreparationSafetyMarkers'), 'Types has LimitedBetaPreparationSafetyMarkers');
  assert(typesSrc.includes('LimitedBetaPreparationGate'), 'Types has LimitedBetaPreparationGate');
  assert(typesSrc.includes('LimitedBetaCohort'), 'Types has LimitedBetaCohort');
  assert(typesSrc.includes('LimitedBetaCohortParticipant'), 'Types has LimitedBetaCohortParticipant');
  assert(typesSrc.includes('LimitedBetaInviteCode'), 'Types has LimitedBetaInviteCode');
  assert(typesSrc.includes('LimitedBetaTermsAcceptance'), 'Types has LimitedBetaTermsAcceptance');
  assert(typesSrc.includes('LimitedBetaRoleBoundary'), 'Types has LimitedBetaRoleBoundary');
  assert(typesSrc.includes('LimitedBetaSupportEscalation'), 'Types has LimitedBetaSupportEscalation');
  assert(typesSrc.includes('LimitedBetaIncidentRollbackPlan'), 'Types has LimitedBetaIncidentRollbackPlan');
  assert(typesSrc.includes('LimitedBetaFinding'), 'Types has LimitedBetaFinding');
  assert(typesSrc.includes('LimitedBetaAudit'), 'Types has LimitedBetaAudit');
  assert(typesSrc.includes('LimitedBetaEvidencePack'), 'Types has LimitedBetaEvidencePack');
}

// --- UI Client ---
const clientPath = path.join(__dirname, '..', 'src', 'ui', 'api', 'limitedBetaPreparationGateClient.ts');
assert(fs.existsSync(clientPath), 'UI client file exists');
if (fs.existsSync(clientPath)) {
  const clientSrc = fs.readFileSync(clientPath, 'utf8');
  assert(clientSrc.includes('/api/admin/beta/preparation-gate'), 'Client has correct base URL');
  assert(clientSrc.includes('getLimitedBetaReadiness'), 'Client has getLimitedBetaReadiness');
  assert(clientSrc.includes('createPreparationGate'), 'Client has createPreparationGate');
  assert(clientSrc.includes('createBetaCohort'), 'Client has createBetaCohort');
  assert(clientSrc.includes('registerCohortParticipant'), 'Client has registerCohortParticipant');
  assert(clientSrc.includes('issueInviteCode'), 'Client has issueInviteCode');
  assert(clientSrc.includes('revokeInviteCode'), 'Client has revokeInviteCode');
  assert(clientSrc.includes('recordTermsAcceptance'), 'Client has recordTermsAcceptance');
  assert(clientSrc.includes('defineRoleBoundary'), 'Client has defineRoleBoundary');
  assert(clientSrc.includes('recordSupportEscalationPath'), 'Client has recordSupportEscalationPath');
  assert(clientSrc.includes('recordIncidentRollbackPlan'), 'Client has recordIncidentRollbackPlan');
  assert(clientSrc.includes('recordBetaFinding'), 'Client has recordBetaFinding');
  assert(clientSrc.includes('resolveBetaFinding'), 'Client has resolveBetaFinding');
  assert(clientSrc.includes('getLimitedBetaAuditTimeline'), 'Client has getLimitedBetaAuditTimeline');
  assert(clientSrc.includes('getLimitedBetaEvidencePack'), 'Client has getLimitedBetaEvidencePack');
}

// --- UI Page ---
const pagePath = path.join(__dirname, '..', 'src', 'ui', 'pages', 'beta', 'LimitedBetaPreparationGate.tsx');
assert(fs.existsSync(pagePath), 'UI page file exists');
if (fs.existsSync(pagePath)) {
  const pageSrc = fs.readFileSync(pagePath, 'utf8');
  assert(pageSrc.includes('LimitedBetaPreparationGate'), 'Page exports LimitedBetaPreparationGate');
  assert(pageSrc.includes('UI_WARNING'), 'Page has UI_WARNING');
  assert(pageSrc.includes('DISABLED (LOCKED)'), 'Page shows DISABLED (LOCKED) safety flags');
  assert(pageSrc.includes('Create New Gate'), 'Page has Create Gate button');
  assert(pageSrc.includes('Check Readiness'), 'Page has Check Readiness button');
  assert(pageSrc.includes('Build Evidence Pack'), 'Page has Build Evidence Pack button');
}

// --- App.tsx route ---
const appPath = path.join(__dirname, '..', 'src', 'ui', 'App.tsx');
if (fs.existsSync(appPath)) {
  const appSrc = fs.readFileSync(appPath, 'utf8');
  assert(appSrc.includes("LimitedBetaPreparationGate"), 'App.tsx imports LimitedBetaPreparationGate');
  assert(appSrc.includes('/admin/beta/preparation-gate'), 'App.tsx has beta preparation gate route');
}

console.log(`\nPhase 127C Admin API / UI: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
