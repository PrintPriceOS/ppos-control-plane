'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Phase 125C: Sandbox Commercial Pilot Admin API / UI Smoke ===\n');

const requiredFiles = [
  'src/api/routes/sandboxCommercialPilotAdmin.js',
  'src/ui/types/sandboxCommercialPilot.ts',
  'src/ui/api/sandboxCommercialPilotClient.ts',
  'src/ui/pages/production/SandboxCommercialPilot.tsx',
];
for (const f of requiredFiles) {
  assert(fs.existsSync(path.join(__dirname, '..', f)), `File exists: ${f}`);
}

const routeSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'api', 'routes', 'sandboxCommercialPilotAdmin.js'), 'utf8');
assert(routeSrc.includes("'/readiness'"), 'Route: GET /readiness');
assert(routeSrc.includes("'/create'"), 'Route: POST /create');
assert(routeSrc.includes("'/invoice-preview'"), 'Route: POST /invoice-preview');
assert(routeSrc.includes("'/simulate-payment'"), 'Route: POST /simulate-payment');
assert(routeSrc.includes("'/simulate-refund'"), 'Route: POST /simulate-refund');
assert(routeSrc.includes("'/simulate-payout'"), 'Route: POST /simulate-payout');
assert(routeSrc.includes("'/settlement-preview'"), 'Route: POST /settlement-preview');
assert(routeSrc.includes("'/printhouse-confirmation'"), 'Route: POST /printhouse-confirmation');
assert(routeSrc.includes("'/finding'"), 'Route: POST /finding');
assert(routeSrc.includes("'/resolve-finding'"), 'Route: POST /resolve-finding');
assert(routeSrc.includes("'/audit-timeline'"), 'Route: GET /audit-timeline');
assert(routeSrc.includes("'/evidence-pack'"), 'Route: GET /evidence-pack');

const adminSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'api', 'routes', 'admin.js'), 'utf8');
assert(adminSrc.includes("sandboxCommercialPilotAdmin"), 'admin.js imports sandboxCommercialPilotAdmin');
assert(adminSrc.includes('/production/sandbox-commercial-pilot'), 'admin.js mounts /production/sandbox-commercial-pilot');

const appSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'App.tsx'), 'utf8');
assert(appSrc.includes('SandboxCommercialPilot'), 'App.tsx imports SandboxCommercialPilot');
assert(appSrc.includes('/admin/production/sandbox-commercial-pilot'), 'App.tsx route registered');

const clientSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'api', 'sandboxCommercialPilotClient.ts'), 'utf8');
assert(clientSrc.includes('/api/admin/production/sandbox-commercial-pilot'), 'Client uses correct base URL');
assert(clientSrc.includes('getSandboxCommercialReadiness'), 'Client: getSandboxCommercialReadiness');
assert(clientSrc.includes('createSandboxCommercialRun'), 'Client: createSandboxCommercialRun');
assert(clientSrc.includes('buildInvoicePreview'), 'Client: buildInvoicePreview');
assert(clientSrc.includes('simulatePaymentIntent'), 'Client: simulatePaymentIntent');
assert(clientSrc.includes('simulateRefundScenario'), 'Client: simulateRefundScenario');
assert(clientSrc.includes('simulatePayoutScenario'), 'Client: simulatePayoutScenario');
assert(clientSrc.includes('buildSettlementPreview'), 'Client: buildSettlementPreview');
assert(clientSrc.includes('getCommercialEvidencePack'), 'Client: getCommercialEvidencePack');

const pageSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'pages', 'production', 'SandboxCommercialPilot.tsx'), 'utf8');
assert(pageSrc.includes('Sandbox commercial pilot only'), 'Page: safety notice present');
assert(pageSrc.includes('NOT_ENABLED'), 'Page: NOT_ENABLED flags displayed');
assert(pageSrc.includes('PAYMENT_EXECUTION'), 'Page: payment execution flag displayed');
assert(pageSrc.includes('INVOICE_ISSUED'), 'Page: invoice issued flag displayed');

const typesSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'types', 'sandboxCommercialPilot.ts'), 'utf8');
assert(typesSrc.includes('SandboxCommercialSafetyMarkers'), 'Types: SandboxCommercialSafetyMarkers');
assert(typesSrc.includes('SandboxCommercialPilotRun'), 'Types: SandboxCommercialPilotRun');
assert(typesSrc.includes('SandboxCommercialInvoicePreview'), 'Types: SandboxCommercialInvoicePreview');
assert(typesSrc.includes('SandboxCommercialPaymentSimulation'), 'Types: SandboxCommercialPaymentSimulation');
assert(typesSrc.includes('SandboxCommercialSettlementPreview'), 'Types: SandboxCommercialSettlementPreview');
assert(typesSrc.includes('SandboxCommercialFinding'), 'Types: SandboxCommercialFinding');

console.log(`\n=== Phase 125C Results: PASS ${passed} | FAIL ${failed} ===`);
if (failed > 0) process.exit(1);
