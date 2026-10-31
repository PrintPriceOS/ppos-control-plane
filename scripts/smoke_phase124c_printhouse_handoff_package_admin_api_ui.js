'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Phase 124C: Printhouse Handoff Package Admin API / UI Smoke ===\n');

// Route file
const routePath = path.join(__dirname, '..', 'src', 'api', 'routes', 'controlledPrinthouseHandoffPackageAdmin.js');
assert(fs.existsSync(routePath), 'Route file exists');
if (fs.existsSync(routePath)) {
  const route = fs.readFileSync(routePath, 'utf8');
  assert(route.includes("require('../services/controlledPrinthouseHandoffPackageService')"), 'Route imports service');
  assert(route.includes("requireAdmin"), 'Route uses requireAdmin');
  assert(route.includes("'/readiness'"), 'Route has /readiness endpoint');
  assert(route.includes("'/create'"), 'Route has /create endpoint');
  assert(route.includes("'/file-metadata'"), 'Route has /file-metadata endpoint');
  assert(route.includes("'/access-grant'"), 'Route has /access-grant endpoint');
  assert(route.includes("'/revoke-access'"), 'Route has /revoke-access endpoint');
  assert(route.includes("'/review'"), 'Route has /review endpoint');
  assert(route.includes("'/accept'"), 'Route has /accept endpoint');
  assert(route.includes("'/reject'"), 'Route has /reject endpoint');
  assert(route.includes("'/finding'"), 'Route has /finding endpoint');
  assert(route.includes("'/resolve-finding'"), 'Route has /resolve-finding endpoint');
  assert(route.includes("'/audit-timeline'"), 'Route has /audit-timeline endpoint');
  assert(route.includes("'/evidence-pack'"), 'Route has /evidence-pack endpoint');
  assert(route.includes('fullPublicEnabled: false'), 'Route safety fullPublicEnabled=false');
  assert(route.includes('paymentExecutionEnabled: false'), 'Route safety paymentExecutionEnabled=false');
  assert(route.includes('productionDispatchEnabled: false'), 'Route safety productionDispatchEnabled=false');
  assert(route.includes('unrestrictedFileAccess: false'), 'Route safety unrestrictedFileAccess=false');
  assert(route.includes('permanentPublicUrl: false'), 'Route safety permanentPublicUrl=false');
  assert(route.includes('SAFETY_MESSAGE'), 'Route has SAFETY_MESSAGE');
}

// Admin.js mount
const adminPath = path.join(__dirname, '..', 'src', 'api', 'routes', 'admin.js');
const adminSrc = fs.readFileSync(adminPath, 'utf8');
assert(adminSrc.includes("require('./controlledPrinthouseHandoffPackageAdmin')"), 'admin.js imports controlledPrinthouseHandoffPackageAdmin');
assert(adminSrc.includes("'/production/printhouse-handoff-package'"), 'admin.js mounts at /production/printhouse-handoff-package');

// UI Types
const typesPath = path.join(__dirname, '..', 'src', 'ui', 'types', 'controlledPrinthouseHandoffPackage.ts');
assert(fs.existsSync(typesPath), 'UI types file exists');
if (fs.existsSync(typesPath)) {
  const types = fs.readFileSync(typesPath, 'utf8');
  assert(types.includes('ControlledPrinthouseHandoffSafetyMarkers'), 'Types has ControlledPrinthouseHandoffSafetyMarkers');
  assert(types.includes('ControlledPrinthouseHandoffPackage'), 'Types has ControlledPrinthouseHandoffPackage');
  assert(types.includes('ControlledPrinthouseHandoffPackageFile'), 'Types has ControlledPrinthouseHandoffPackageFile');
  assert(types.includes('ControlledPrinthouseHandoffAccessGrant'), 'Types has ControlledPrinthouseHandoffAccessGrant');
  assert(types.includes('ControlledPrinthouseHandoffFinding'), 'Types has ControlledPrinthouseHandoffFinding');
  assert(types.includes('ControlledPrinthouseHandoffAudit'), 'Types has ControlledPrinthouseHandoffAudit');
}

// UI Client
const clientPath = path.join(__dirname, '..', 'src', 'ui', 'api', 'controlledPrinthouseHandoffPackageClient.ts');
assert(fs.existsSync(clientPath), 'UI client file exists');
if (fs.existsSync(clientPath)) {
  const client = fs.readFileSync(clientPath, 'utf8');
  assert(client.includes('/api/admin/production/printhouse-handoff-package'), 'Client uses correct base URL');
  assert(client.includes('getHandoffPackageReadiness'), 'Client has getReadiness');
  assert(client.includes('createHandoffPackage'), 'Client has createHandoffPackage');
  assert(client.includes('addPackageFileMetadata'), 'Client has addPackageFileMetadata');
  assert(client.includes('createScopedFileAccessGrant'), 'Client has createScopedFileAccessGrant');
  assert(client.includes('revokeFileAccessGrant'), 'Client has revokeFileAccessGrant');
  assert(client.includes('submitPrinthouseHandoffReview'), 'Client has submitPrinthouseHandoffReview');
  assert(client.includes('acceptHandoffPackage'), 'Client has acceptHandoffPackage');
  assert(client.includes('rejectHandoffPackage'), 'Client has rejectHandoffPackage');
  assert(client.includes('recordHandoffFinding'), 'Client has recordHandoffFinding');
  assert(client.includes('resolveHandoffFinding'), 'Client has resolveHandoffFinding');
  assert(client.includes('getHandoffAuditTimeline'), 'Client has getHandoffAuditTimeline');
  assert(client.includes('getHandoffEvidencePack'), 'Client has getHandoffEvidencePack');
}

// UI Page
const pagePath = path.join(__dirname, '..', 'src', 'ui', 'pages', 'production', 'ControlledPrinthouseHandoffPackage.tsx');
assert(fs.existsSync(pagePath), 'UI page file exists');
if (fs.existsSync(pagePath)) {
  const page = fs.readFileSync(pagePath, 'utf8');
  assert(page.includes('Controlled Printhouse Handoff'), 'Page has title');
  assert(page.includes('SAFETY_NOTICE'), 'Page has SAFETY_NOTICE');
  assert(page.includes('NOT_ENABLED'), 'Page shows NOT_ENABLED flags');
  assert(page.includes('FULL_PUBLIC'), 'Page shows FULL_PUBLIC status');
  assert(page.includes('PAYMENT_EXECUTION'), 'Page shows PAYMENT_EXECUTION status');
  assert(page.includes('PRODUCTION_DISPATCH'), 'Page shows PRODUCTION_DISPATCH status');
  assert(page.includes('UNRESTRICTED_FILE_ACCESS'), 'Page shows UNRESTRICTED_FILE_ACCESS status');
  assert(page.includes('PERMANENT_PUBLIC_URL'), 'Page shows PERMANENT_PUBLIC_URL status');
  assert(page.includes('Check Readiness'), 'Page has Check Readiness button');
  assert(page.includes('Create Package'), 'Page has Create Package button');
  assert(page.includes('Add File Metadata'), 'Page has Add File Metadata button');
  assert(page.includes('Create Access Grant'), 'Page has Create Access Grant button');
  assert(page.includes('Revoke Grant'), 'Page has Revoke Grant button');
  assert(page.includes('Accept Package'), 'Page has Accept Package button');
  assert(page.includes('Reject Package'), 'Page has Reject Package button');
  assert(page.includes('Evidence Pack'), 'Page has Evidence Pack button');
  assert(page.includes('Audit Timeline'), 'Page has Audit Timeline button');
}

// App.tsx route
const appPath = path.join(__dirname, '..', 'src', 'ui', 'App.tsx');
const appSrc = fs.readFileSync(appPath, 'utf8');
assert(appSrc.includes("import { ControlledPrinthouseHandoffPackage }"), 'App.tsx imports ControlledPrinthouseHandoffPackage');
assert(appSrc.includes('/admin/production/printhouse-handoff-package'), 'App.tsx has route for printhouse-handoff-package');

// No forbidden patterns in route/service
const allSources = [
  fs.readFileSync(routePath, 'utf8'),
  fs.readFileSync(path.join(__dirname, '..', 'src', 'api', 'services', 'controlledPrinthouseHandoffPackageService.js'), 'utf8'),
];
const allSrc = allSources.join('\n');
const forbidden = [
  'fullPublicEnabled: true', 'openMarketplaceAccessEnabled: true', 'liveProviderConnectivityEnabled: true',
  'paymentExecutionEnabled: true', 'refundExecutionEnabled: true', 'payoutExecutionEnabled: true',
  'productionDispatchEnabled: true', 'unrestrictedFileAccess: true', 'permanentPublicUrl: true',
  'providerExternalSubmissionEnabled: true', 'externalSubmission: true', 'sourceMutationOutsidePilotScope: true',
  'sendToProvider', 'dispatchToMachine', 'charge(', 'capture(', 'refund(', 'payout(', 'submitTax', 'submitVat', 'submitAccounting',
];
for (const f of forbidden) {
  assert(!allSrc.includes(f), `No forbidden pattern in source: ${f}`);
}

console.log(`\n=== Phase 124C Results: PASS ${passed} | FAIL ${failed} ===`);
if (failed > 0) process.exit(1);
