'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Phase 123C: Founding Printhouse Pilot Admin API / UI Smoke ===\n');

// Route file
const routePath = path.join(__dirname, '..', 'src', 'api', 'routes', 'foundingPrinthousePilotGateAdmin.js');
assert(fs.existsSync(routePath), 'Route file exists');
if (fs.existsSync(routePath)) {
  const route = fs.readFileSync(routePath, 'utf8');
  assert(route.includes("require('../services/foundingPrinthousePilotGateService')"), 'Route imports service');
  assert(route.includes("requireAdmin"), 'Route uses requireAdmin');
  assert(route.includes("'/readiness'"), 'Route has /readiness endpoint');
  assert(route.includes("'/program/create'"), 'Route has /program/create endpoint');
  assert(route.includes("'/participant/register'"), 'Route has /participant/register endpoint');
  assert(route.includes("'/participant/approve'"), 'Route has /participant/approve endpoint');
  assert(route.includes("'/participant/suspend'"), 'Route has /participant/suspend endpoint');
  assert(route.includes("'/order/link'"), 'Route has /order/link endpoint');
  assert(route.includes("'/order-handoff-readiness'"), 'Route has /order-handoff-readiness endpoint');
  assert(route.includes("'/review'"), 'Route has /review endpoint');
  assert(route.includes("'/finding'"), 'Route has /finding endpoint');
  assert(route.includes("'/resolve-finding'"), 'Route has /resolve-finding endpoint');
  assert(route.includes("'/audit-timeline'"), 'Route has /audit-timeline endpoint');
  assert(route.includes("'/evidence-pack'"), 'Route has /evidence-pack endpoint');
  assert(route.includes('fullPublicEnabled: false'), 'Route safety fullPublicEnabled=false');
  assert(route.includes('paymentExecutionEnabled: false'), 'Route safety paymentExecutionEnabled=false');
  assert(route.includes('SAFETY_MESSAGE'), 'Route has SAFETY_MESSAGE');
}

// Admin.js mount
const adminPath = path.join(__dirname, '..', 'src', 'api', 'routes', 'admin.js');
const adminSrc = fs.readFileSync(adminPath, 'utf8');
assert(adminSrc.includes("require('./foundingPrinthousePilotGateAdmin')"), 'admin.js imports foundingPrinthousePilotGateAdmin');
assert(adminSrc.includes("'/production/founding-printhouse-pilot'"), 'admin.js mounts at /production/founding-printhouse-pilot');

// UI Types
const typesPath = path.join(__dirname, '..', 'src', 'ui', 'types', 'foundingPrinthousePilotGate.ts');
assert(fs.existsSync(typesPath), 'UI types file exists');
if (fs.existsSync(typesPath)) {
  const types = fs.readFileSync(typesPath, 'utf8');
  assert(types.includes('FoundingPrinthousePilotSafetyMarkers'), 'Types has FoundingPrinthousePilotSafetyMarkers');
  assert(types.includes('FoundingPrinthousePilotProgram'), 'Types has FoundingPrinthousePilotProgram');
  assert(types.includes('FoundingPrinthousePilotParticipant'), 'Types has FoundingPrinthousePilotParticipant');
  assert(types.includes('FoundingPrinthousePilotOrderLink'), 'Types has FoundingPrinthousePilotOrderLink');
  assert(types.includes('FoundingPrinthousePilotFinding'), 'Types has FoundingPrinthousePilotFinding');
  assert(types.includes('FoundingPrinthousePilotAudit'), 'Types has FoundingPrinthousePilotAudit');
}

// UI Client
const clientPath = path.join(__dirname, '..', 'src', 'ui', 'api', 'foundingPrinthousePilotGateClient.ts');
assert(fs.existsSync(clientPath), 'UI client file exists');
if (fs.existsSync(clientPath)) {
  const client = fs.readFileSync(clientPath, 'utf8');
  assert(client.includes('/api/admin/production/founding-printhouse-pilot'), 'Client uses correct base URL');
  assert(client.includes('getFoundingPrinthousePilotReadiness'), 'Client has getReadiness');
  assert(client.includes('createPilotProgram'), 'Client has createPilotProgram');
  assert(client.includes('registerFoundingPrinthouse'), 'Client has registerFoundingPrinthouse');
  assert(client.includes('approveParticipantForPilot'), 'Client has approveParticipant');
  assert(client.includes('suspendParticipant'), 'Client has suspendParticipant');
  assert(client.includes('linkInternalPilotOrder'), 'Client has linkInternalPilotOrder');
  assert(client.includes('getOrderHandoffReadiness'), 'Client has getOrderHandoffReadiness');
  assert(client.includes('submitPrinthouseReview'), 'Client has submitPrinthouseReview');
  assert(client.includes('recordPilotFinding'), 'Client has recordPilotFinding');
  assert(client.includes('resolvePilotFinding'), 'Client has resolvePilotFinding');
  assert(client.includes('getFoundingPrinthousePilotAuditTimeline'), 'Client has getAuditTimeline');
  assert(client.includes('getFoundingPrinthousePilotEvidencePack'), 'Client has getEvidencePack');
}

// UI Page
const pagePath = path.join(__dirname, '..', 'src', 'ui', 'pages', 'production', 'FoundingPrinthousePilotGate.tsx');
assert(fs.existsSync(pagePath), 'UI page file exists');
if (fs.existsSync(pagePath)) {
  const page = fs.readFileSync(pagePath, 'utf8');
  assert(page.includes('Founding Printhouse Pilot Gate'), 'Page has title');
  assert(page.includes('SAFETY_NOTICE'), 'Page has SAFETY_NOTICE');
  assert(page.includes('NOT_ENABLED'), 'Page shows NOT_ENABLED flags');
  assert(page.includes('FULL_PUBLIC'), 'Page shows FULL_PUBLIC status');
  assert(page.includes('PAYMENT_EXECUTION'), 'Page shows PAYMENT_EXECUTION status');
  assert(page.includes('OPEN_MARKETPLACE_ACCESS'), 'Page shows OPEN_MARKETPLACE_ACCESS status');
  assert(page.includes('AUTOMATIC_PRODUCTION_DISPATCH'), 'Page shows AUTOMATIC_PRODUCTION_DISPATCH status');
  assert(page.includes('Check Readiness'), 'Page has Check Readiness button');
  assert(page.includes('Create Program'), 'Page has Create Program button');
  assert(page.includes('Register Printhouse'), 'Page has Register Printhouse button');
  assert(page.includes('Approve Participant'), 'Page has Approve Participant button');
  assert(page.includes('Evidence Pack'), 'Page has Evidence Pack button');
  assert(page.includes('Audit Timeline'), 'Page has Audit Timeline button');
}

// App.tsx route
const appPath = path.join(__dirname, '..', 'src', 'ui', 'App.tsx');
const appSrc = fs.readFileSync(appPath, 'utf8');
assert(appSrc.includes("import { FoundingPrinthousePilotGate }"), 'App.tsx imports FoundingPrinthousePilotGate');
assert(appSrc.includes('/admin/production/founding-printhouse-pilot'), 'App.tsx has route for founding-printhouse-pilot');

// No forbidden patterns in route/service
const allSources = [
  fs.readFileSync(routePath, 'utf8'),
  fs.readFileSync(path.join(__dirname, '..', 'src', 'api', 'services', 'foundingPrinthousePilotGateService.js'), 'utf8'),
];
const allSrc = allSources.join('\n');
const forbidden = [
  'fullPublicEnabled: true', 'openMarketplaceAccessEnabled: true', 'liveProviderConnectivityEnabled: true',
  'paymentExecutionEnabled: true', 'refundExecutionEnabled: true', 'payoutExecutionEnabled: true',
  'providerExternalSubmissionEnabled: true', 'externalSubmission: true', 'sourceMutationOutsidePilotScope: true',
  'sendToProvider', 'charge(', 'capture(', 'refund(', 'payout(', 'submitTax', 'submitVat', 'submitAccounting',
];
for (const f of forbidden) {
  assert(!allSrc.includes(f), `No forbidden pattern in source: ${f}`);
}

console.log(`\n=== Phase 123C Results: PASS ${passed} | FAIL ${failed} ===`);
if (failed > 0) process.exit(1);
