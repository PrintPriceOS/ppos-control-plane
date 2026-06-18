'use strict';

const fs = require('fs');
const path = require('path');
let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Phase 122.2C: Runtime Verification Admin API & UI ===\n');

// Route file exists
const routePath = path.resolve(__dirname, '..', 'src', 'api', 'routes', 'internalOrderLifecycleRuntimeVerificationAdmin.js');
assert(fs.existsSync(routePath), 'Admin route file exists');

const routeSrc = fs.readFileSync(routePath, 'utf8');

// Endpoints
assert(routeSrc.includes("'/readiness'"), 'Route: GET /readiness');
assert(routeSrc.includes("'/create'"), 'Route: POST /create');
assert(routeSrc.includes("'/verify-db-read-through'"), 'Route: POST /verify-db-read-through');
assert(routeSrc.includes("'/verify-memory-empty-recovery'"), 'Route: POST /verify-memory-empty-recovery');
assert(routeSrc.includes("'/verify-audit-recovery'"), 'Route: POST /verify-audit-recovery');
assert(routeSrc.includes("'/verify-evidence-recovery'"), 'Route: POST /verify-evidence-recovery');
assert(routeSrc.includes("'/verify-allowlist'"), 'Route: POST /verify-allowlist');
assert(routeSrc.includes("'/verify-blockers'"), 'Route: POST /verify-blockers');
assert(routeSrc.includes("'/audit-timeline'"), 'Route: GET /audit-timeline');
assert(routeSrc.includes("'/evidence-pack'"), 'Route: GET /evidence-pack');

// Safety in route
assert(routeSrc.includes('serviceRestartExecuted: false'), 'Route safety: serviceRestartExecuted false');
assert(routeSrc.includes('realRestartExecuted: false'), 'Route safety: realRestartExecuted false');
assert(routeSrc.includes('productionActivationEnabled: false'), 'Route safety: productionActivationEnabled false');

// Route mounted in admin.js
const adminPath = path.resolve(__dirname, '..', 'src', 'api', 'routes', 'admin.js');
const adminSrc = fs.readFileSync(adminPath, 'utf8');
assert(adminSrc.includes("require('./internalOrderLifecycleRuntimeVerificationAdmin')"), 'Route imported in admin.js');
assert(adminSrc.includes("'/production/internal-order-lifecycle-runtime-verification'"), 'Route mounted at correct path in admin.js');

// UI types
const typesPath = path.resolve(__dirname, '..', 'src', 'ui', 'types', 'internalOrderLifecycleRuntimeVerification.ts');
assert(fs.existsSync(typesPath), 'UI types file exists');
const typesSrc = fs.readFileSync(typesPath, 'utf8');
assert(typesSrc.includes('RuntimeVerificationRun'), 'Type: RuntimeVerificationRun');
assert(typesSrc.includes('RuntimeVerificationCheck'), 'Type: RuntimeVerificationCheck');
assert(typesSrc.includes('RuntimeVerificationAudit'), 'Type: RuntimeVerificationAudit');
assert(typesSrc.includes('RuntimeVerificationSafetyMarkers'), 'Type: RuntimeVerificationSafetyMarkers');
assert(typesSrc.includes('serviceRestartExecuted'), 'Type includes serviceRestartExecuted');
assert(typesSrc.includes('realRestartExecuted'), 'Type includes realRestartExecuted');

// UI client
const clientPath = path.resolve(__dirname, '..', 'src', 'ui', 'api', 'internalOrderLifecycleRuntimeVerificationClient.ts');
assert(fs.existsSync(clientPath), 'UI API client file exists');
const clientSrc = fs.readFileSync(clientPath, 'utf8');
assert(clientSrc.includes('getRuntimeVerificationReadiness'), 'Client: getRuntimeVerificationReadiness');
assert(clientSrc.includes('createRuntimeVerificationRun'), 'Client: createRuntimeVerificationRun');
assert(clientSrc.includes('verifyDbReadThrough'), 'Client: verifyDbReadThrough');
assert(clientSrc.includes('verifyMemoryEmptyRecovery'), 'Client: verifyMemoryEmptyRecovery');
assert(clientSrc.includes('verifyAuditRecovery'), 'Client: verifyAuditRecovery');
assert(clientSrc.includes('verifyEvidenceRecovery'), 'Client: verifyEvidenceRecovery');
assert(clientSrc.includes('verifyAllowlist'), 'Client: verifyAllowlist');
assert(clientSrc.includes('verifyBlockers'), 'Client: verifyBlockers');
assert(clientSrc.includes('getRuntimeVerificationAuditTimeline'), 'Client: getRuntimeVerificationAuditTimeline');
assert(clientSrc.includes('getRuntimeVerificationEvidencePack'), 'Client: getRuntimeVerificationEvidencePack');
assert(clientSrc.includes('/api/admin/production/internal-order-lifecycle-runtime-verification'), 'Client: correct base URL');

// UI page
const pagePath = path.resolve(__dirname, '..', 'src', 'ui', 'pages', 'production', 'InternalOrderLifecycleRuntimeVerification.tsx');
assert(fs.existsSync(pagePath), 'UI page file exists');
const pageSrc = fs.readFileSync(pagePath, 'utf8');
assert(pageSrc.includes('InternalOrderLifecycleRuntimeVerification'), 'Page: component exported');
assert(pageSrc.includes('Runtime Verification'), 'Page: title includes Runtime Verification');
assert(pageSrc.includes('No Real Restart Executed'), 'Page: restart safety notice');
assert(pageSrc.includes('SERVICE_RESTART_EXECUTED'), 'Page: shows SERVICE_RESTART_EXECUTED status');
assert(pageSrc.includes('REAL_RESTART_EXECUTED'), 'Page: shows REAL_RESTART_EXECUTED status');
assert(pageSrc.includes('memory-only is not production-valid'), 'Page: memory fallback warning');
assert(pageSrc.includes('FULL_PUBLIC'), 'Page: shows FULL_PUBLIC status');
assert(pageSrc.includes('PAYMENT_EXECUTION'), 'Page: shows PAYMENT_EXECUTION status');
assert(pageSrc.includes('Persistence Mode'), 'Page: shows persistence mode');
assert(pageSrc.includes('Persistence Status'), 'Page: shows persistence status');

// App.tsx route
const appPath = path.resolve(__dirname, '..', 'src', 'ui', 'App.tsx');
const appSrc = fs.readFileSync(appPath, 'utf8');
assert(appSrc.includes("import { InternalOrderLifecycleRuntimeVerification }"), 'App.tsx: import statement');
assert(appSrc.includes('/admin/production/internal-order-lifecycle-runtime-verification'), 'App.tsx: route registered');

// Manual drill documentation
const drillDocPath = path.resolve(__dirname, '..', 'docs', 'phase122_2_runtime_restart_recovery_manual_drill.md');
assert(fs.existsSync(drillDocPath), 'Manual drill documentation exists');
const drillDoc = fs.readFileSync(drillDocPath, 'utf8');
assert(drillDoc.includes('pm2 restart'), 'Drill doc: contains PM2 restart instruction (manual)');
assert(drillDoc.includes('manual'), 'Drill doc: mentions manual');
assert(drillDoc.includes('No code in this system executes'), 'Drill doc: clarifies no code restart');

// No forbidden patterns in route
const forbiddenPatterns = [
  'fullPublicEnabled: true', 'paymentExecutionEnabled: true',
  'productionActivationEnabled: true', 'serviceRestartExecuted: true',
  'realRestartExecuted: true',
  'charge(', 'capture(', 'refund(', 'payout(', 'sendToProvider',
];
for (const p of forbiddenPatterns) {
  assert(!routeSrc.includes(p), `Route does not contain forbidden pattern: ${p}`);
}

console.log(`\n=== Phase 122.2C Results: PASS ${passed} | FAIL ${failed} ===`);
if (failed > 0) process.exit(1);
