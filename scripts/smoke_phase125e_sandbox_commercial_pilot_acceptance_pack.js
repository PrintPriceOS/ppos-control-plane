'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Phase 125E: Sandbox Commercial Pilot Acceptance Pack ===\n');

// --- File existence checks ---
const requiredFiles = [
  'migrations/069_phase125_sandbox_commercial_invoice_payment_handoff_pilot.sql',
  'src/api/services/sandboxCommercialPilotService.js',
  'src/api/routes/sandboxCommercialPilotAdmin.js',
  'src/ui/types/sandboxCommercialPilot.ts',
  'src/ui/api/sandboxCommercialPilotClient.ts',
  'src/ui/pages/production/SandboxCommercialPilot.tsx',
  'docs/phase125_sandbox_commercial_invoice_payment_handoff_pilot.md',
];
for (const f of requiredFiles) {
  assert(fs.existsSync(path.join(__dirname, '..', f)), `File exists: ${f}`);
}

// --- Service methods ---
process.env.NODE_ENV = 'test';
process.env.ALLOW_DB_FALLBACK_FOR_SMOKE = 'true';
process.env.ALLOW_UNSCOPED_PILOT_TENANTS_FOR_TESTS = 'true';

const SandboxCommercialPilotService = require('../src/api/services/sandboxCommercialPilotService');
const svc = new SandboxCommercialPilotService();

const requiredMethods = [
  'createSandboxCommercialRun', 'buildInvoicePreview', 'simulatePaymentIntent',
  'simulateRefundScenario', 'simulatePayoutScenario', 'buildSettlementPreview',
  'submitPrinthouseCommercialConfirmation', 'recordCommercialFinding',
  'resolveCommercialFinding', 'buildCommercialEvidencePack',
  'getCommercialAuditTimeline', 'getReadiness',
];
for (const m of requiredMethods) {
  assert(typeof svc[m] === 'function', `Service method: ${m}`);
}

// --- Safety invariant checks ---
const sourceFiles = [
  'src/api/services/sandboxCommercialPilotService.js',
  'src/api/routes/sandboxCommercialPilotAdmin.js',
];
for (const f of sourceFiles) {
  const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  assert(src.includes('fullPublicEnabled: false'), `${f}: fullPublicEnabled=false`);
  assert(src.includes('paymentExecutionEnabled: false'), `${f}: paymentExecutionEnabled=false`);
  assert(src.includes('refundExecutionEnabled: false'), `${f}: refundExecutionEnabled=false`);
  assert(src.includes('payoutExecutionEnabled: false'), `${f}: payoutExecutionEnabled=false`);
  assert(src.includes('providerLiveCaptureEnabled: false'), `${f}: providerLiveCaptureEnabled=false`);
  assert(src.includes('invoiceIssued: false'), `${f}: invoiceIssued=false`);
  assert(src.includes('invoicePreviewOnly: true'), `${f}: invoicePreviewOnly=true`);
  assert(src.includes('paymentSimulationOnly: true'), `${f}: paymentSimulationOnly=true`);
  assert(!src.includes('fullPublicEnabled: true'), `${f}: no fullPublicEnabled: true`);
  assert(!src.includes('paymentExecutionEnabled: true'), `${f}: no paymentExecutionEnabled: true`);
  assert(!src.includes('invoiceIssued: true'), `${f}: no invoiceIssued: true`);
  assert(!src.includes('charge('), `${f}: no charge(`);
  assert(!src.includes('capture('), `${f}: no capture(`);
  assert(!src.includes('sendToProvider'), `${f}: no sendToProvider`);
  assert(!src.includes('submitTax'), `${f}: no submitTax`);
  assert(!src.includes('submitAccounting'), `${f}: no submitAccounting`);
}

// --- Migration safety ---
const migSrc = fs.readFileSync(path.join(__dirname, '..', 'migrations', '069_phase125_sandbox_commercial_invoice_payment_handoff_pilot.sql'), 'utf8');
assert(migSrc.includes('sandbox_only TINYINT(1) NOT NULL DEFAULT 1'), 'Migration: sandbox_only defaults to 1');
assert(migSrc.includes('payment_execution_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'Migration: payment_execution_enabled defaults to 0');
assert(migSrc.includes('refund_execution_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'Migration: refund_execution_enabled defaults to 0');
assert(migSrc.includes('payout_execution_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'Migration: payout_execution_enabled defaults to 0');
assert(migSrc.includes('provider_live_capture_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'Migration: provider_live_capture_enabled defaults to 0');
assert(migSrc.includes('full_public_enabled TINYINT(1) NOT NULL DEFAULT 0'), 'Migration: full_public_enabled defaults to 0');
assert(migSrc.includes('invoice_preview_only TINYINT(1) NOT NULL DEFAULT 1'), 'Migration: invoice_preview_only defaults to 1');
assert(migSrc.includes('invoice_issued TINYINT(1) NOT NULL DEFAULT 0'), 'Migration: invoice_issued defaults to 0');
assert(migSrc.includes('payment_simulation_only TINYINT(1) NOT NULL DEFAULT 1'), 'Migration: payment_simulation_only defaults to 1');

// --- E2E acceptance ---
(async () => {
  const svcE2E = new SandboxCommercialPilotService();

  // Full E2E flow
  const run = await svcE2E.createSandboxCommercialRun({
    pilot_order_id: 'acc-order-125', pilot_program_id: 'acc-prog-125', created_by: 'acceptance',
  });
  assert(run.sandbox_run.sandbox_run_id, 'Acceptance: sandbox run created');
  assert(run.safety.paymentExecutionEnabled === false, 'Acceptance: paymentExecutionEnabled=false');
  assert(run.safety.fullPublicEnabled === false, 'Acceptance: fullPublicEnabled=false');
  assert(run.safety.invoiceIssued === false, 'Acceptance: invoiceIssued=false');
  assert(run.safety.invoicePreviewOnly === true, 'Acceptance: invoicePreviewOnly=true');
  assert(run.safety.paymentSimulationOnly === true, 'Acceptance: paymentSimulationOnly=true');
  assert(run.safety.payoutPreviewOnly === true, 'Acceptance: payoutPreviewOnly=true');

  const sandboxRunId = run.sandbox_run.sandbox_run_id;

  // Invoice preview
  const invoice = await svcE2E.buildInvoicePreview({ sandbox_run_id: sandboxRunId, currency: 'USD', total_amount_preview: 200, created_by: 'acceptance' });
  assert(invoice.invoicePreviewOnly === true, 'Acceptance: invoice preview only');
  assert(invoice.invoiceIssued === false, 'Acceptance: invoice not issued');

  // Payment simulation
  const payment = await svcE2E.simulatePaymentIntent({ sandbox_run_id: sandboxRunId, simulated_amount: 200, created_by: 'acceptance' });
  assert(payment.paymentSimulationOnly === true, 'Acceptance: payment simulation only');
  assert(payment.paymentExecutionEnabled === false, 'Acceptance: payment not executed');

  // Evidence pack
  const evidence = await svcE2E.buildCommercialEvidencePack({ sandbox_run_id: sandboxRunId });
  assert(evidence.evidence_pack.integrity_hash, 'Acceptance: evidence has integrity hash');
  assert(evidence.evidence_pack.evidence_schema_version === '125.0', 'Acceptance: evidence schema version');
  assert(evidence.evidence_pack.redaction_classification === 'INTERNAL_ONLY', 'Acceptance: redaction classification');
  assert(evidence.evidence_pack.redacted_fields.includes('raw_payment_credentials'), 'Acceptance: redacted_fields includes raw_payment_credentials');
  assert(evidence.evidence_pack.redacted_fields.includes('secrets'), 'Acceptance: redacted_fields includes secrets');
  assert(!evidence.evidence_pack.raw_payment_credentials, 'Acceptance: no raw_payment_credentials in evidence');
  assert(!evidence.evidence_pack.secrets, 'Acceptance: no secrets in evidence');

  // Route checks
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'App.tsx'), 'utf8');
  assert(appSrc.includes('/admin/production/sandbox-commercial-pilot'), 'Acceptance: App.tsx route registered');

  const adminSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'api', 'routes', 'admin.js'), 'utf8');
  assert(adminSrc.includes('/production/sandbox-commercial-pilot'), 'Acceptance: admin.js mount');

  // Prior phase checks
  assert(fs.existsSync(path.join(__dirname, '..', 'migrations', '068_phase124_controlled_printhouse_handoff_file_package_pilot.sql')), 'Acceptance: Phase 124 migration exists');
  assert(fs.existsSync(path.join(__dirname, '..', 'src', 'api', 'services', 'controlledPrinthouseHandoffPackageService.js')), 'Acceptance: Phase 124 service exists');

  console.log(`\n=== Phase 125E Results: PASS ${passed} | FAIL ${failed} ===`);
  if (failed > 0) process.exit(1);
})().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
