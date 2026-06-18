'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Phase 125B: Sandbox Commercial Pilot Service Smoke ===\n');

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
  assert(src.includes('openMarketplaceAccessEnabled: false'), `${f}: openMarketplaceAccessEnabled=false`);
  assert(src.includes('invoiceIssued: false'), `${f}: invoiceIssued=false`);
  assert(src.includes('invoicePreviewOnly: true'), `${f}: invoicePreviewOnly=true`);
  assert(src.includes('paymentSimulationOnly: true'), `${f}: paymentSimulationOnly=true`);
  assert(src.includes('payoutPreviewOnly: true'), `${f}: payoutPreviewOnly=true`);
  assert(!src.includes('fullPublicEnabled: true'), `${f}: no fullPublicEnabled: true`);
  assert(!src.includes('paymentExecutionEnabled: true'), `${f}: no paymentExecutionEnabled: true`);
  assert(!src.includes('refundExecutionEnabled: true'), `${f}: no refundExecutionEnabled: true`);
  assert(!src.includes('payoutExecutionEnabled: true'), `${f}: no payoutExecutionEnabled: true`);
  assert(!src.includes('providerLiveCaptureEnabled: true'), `${f}: no providerLiveCaptureEnabled: true`);
  assert(!src.includes('charge('), `${f}: no charge(`);
  assert(!src.includes('capture('), `${f}: no capture(`);
  assert(!src.includes('sendToProvider'), `${f}: no sendToProvider`);
  assert(!src.includes('submitTax'), `${f}: no submitTax`);
  assert(!src.includes('submitAccounting'), `${f}: no submitAccounting`);
}

(async () => {
  const run = await svc.createSandboxCommercialRun({ pilot_order_id: 'test-order-125', created_by: 'smoke' });
  assert(run.sandbox_run.sandbox_run_id, 'createSandboxCommercialRun returns sandbox_run_id');
  assert(run.safety.paymentExecutionEnabled === false, 'Run safety: paymentExecutionEnabled=false');
  assert(run.safety.invoiceIssued === false, 'Run safety: invoiceIssued=false');

  const sandboxRunId = run.sandbox_run.sandbox_run_id;

  const invoice = await svc.buildInvoicePreview({ sandbox_run_id: sandboxRunId, currency: 'USD', total_amount_preview: 50, created_by: 'smoke' });
  assert(invoice.invoicePreviewOnly === true, 'Invoice: preview only');
  assert(invoice.invoiceIssued === false, 'Invoice: not issued');
  assert(invoice.sourceMutation === false, 'Invoice: no source mutation');

  const payment = await svc.simulatePaymentIntent({ sandbox_run_id: sandboxRunId, simulated_amount: 50, created_by: 'smoke' });
  assert(payment.paymentSimulationOnly === true, 'Payment: simulation only');
  assert(payment.paymentExecutionEnabled === false, 'Payment: execution disabled');
  assert(payment.liveProviderConnectivityEnabled === false, 'Payment: no live provider');

  const refundSim = await svc.simulateRefundScenario({ sandbox_run_id: sandboxRunId, simulated_amount: 50, created_by: 'smoke' });
  assert(refundSim.refundSimulationOnly === true, 'Refund: simulation only');
  assert(refundSim.refundExecutionEnabled === false, 'Refund: execution disabled');

  const payoutSim = await svc.simulatePayoutScenario({ sandbox_run_id: sandboxRunId, simulated_amount: 40, created_by: 'smoke' });
  assert(payoutSim.payoutSimulationOnly === true, 'Payout: simulation only');
  assert(payoutSim.payoutExecutionEnabled === false, 'Payout: execution disabled');

  const settlement = await svc.buildSettlementPreview({ sandbox_run_id: sandboxRunId, settlement_amount_preview: 50, printhouse_payout_preview: 40, platform_fee_preview: 10, created_by: 'smoke' });
  assert(settlement.payoutPreviewOnly === true, 'Settlement: preview only');
  assert(settlement.payoutExecutionEnabled === false, 'Settlement: payout disabled');

  console.log(`\n=== Phase 125B Results: PASS ${passed} | FAIL ${failed} ===`);
  if (failed > 0) process.exit(1);
})().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
