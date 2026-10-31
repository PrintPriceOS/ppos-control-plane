'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Phase 125D: Sandbox Commercial Pilot E2E Regression ===\n');

process.env.NODE_ENV = 'test';
process.env.ALLOW_DB_FALLBACK_FOR_SMOKE = 'true';
process.env.ALLOW_UNSCOPED_PILOT_TENANTS_FOR_TESTS = 'true';

const SandboxCommercialPilotService = require('../src/api/services/sandboxCommercialPilotService');

(async () => {
  const svc = new SandboxCommercialPilotService();

  // Create sandbox run
  const run = await svc.createSandboxCommercialRun({
    pilot_order_id: 'e2e-order-125',
    pilot_program_id: 'e2e-prog-125',
    participant_id: 'e2e-participant-125',
    handoff_package_id: 'e2e-handoff-125',
    printhouse_tenant_id: 'e2e-ph-125',
    created_by: 'e2e',
  });
  assert(run.sandbox_run.sandbox_run_id, 'E2E: sandbox run created');
  const sandboxRunId = run.sandbox_run.sandbox_run_id;

  // Invoice preview
  const invoice = await svc.buildInvoicePreview({
    sandbox_run_id: sandboxRunId,
    currency: 'USD',
    total_amount_preview: 100.00,
    line_items_json: [{ description: 'Business cards 500pc', quantity: 1, unit_price: 100 }],
    created_by: 'e2e',
  });
  assert(invoice.invoicePreviewOnly === true, 'E2E: invoice is preview only');
  assert(invoice.invoiceIssued === false, 'E2E: invoice not issued');
  assert(invoice.sourceMutation === false, 'E2E: no source mutation');
  assert(invoice.invoice_preview.invoice_preview_id, 'E2E: invoice has ID');

  // Payment simulation
  const payment = await svc.simulatePaymentIntent({
    sandbox_run_id: sandboxRunId,
    simulated_amount: 100.00,
    simulated_currency: 'USD',
    simulated_provider: 'SANDBOX_STRIPE',
    created_by: 'e2e',
  });
  assert(payment.paymentSimulationOnly === true, 'E2E: payment is simulation only');
  assert(payment.paymentExecutionEnabled === false, 'E2E: payment execution disabled');
  assert(payment.liveProviderConnectivityEnabled === false, 'E2E: no live provider');
  assert(payment.payment_simulation.simulation_result_json.real_charge_executed === false, 'E2E: no real charge');
  assert(payment.payment_simulation.simulation_result_json.real_capture_executed === false, 'E2E: no real capture');
  assert(payment.payment_simulation.simulation_result_json.provider_contacted === false, 'E2E: provider not contacted');

  // Refund simulation
  const refundSim = await svc.simulateRefundScenario({
    sandbox_run_id: sandboxRunId,
    simulated_amount: 100.00,
    created_by: 'e2e',
  });
  assert(refundSim.refundSimulationOnly === true, 'E2E: refund is simulation only');
  assert(refundSim.refundExecutionEnabled === false, 'E2E: refund execution disabled');
  assert(refundSim.refund_simulation.simulation_result_json.real_refund_executed === false, 'E2E: no real refund');

  // Payout simulation
  const payoutSim = await svc.simulatePayoutScenario({
    sandbox_run_id: sandboxRunId,
    simulated_amount: 80.00,
    created_by: 'e2e',
  });
  assert(payoutSim.payoutSimulationOnly === true, 'E2E: payout is simulation only');
  assert(payoutSim.payoutExecutionEnabled === false, 'E2E: payout execution disabled');
  assert(payoutSim.payout_simulation.simulation_result_json.real_payout_executed === false, 'E2E: no real payout');

  // Settlement preview
  const settlement = await svc.buildSettlementPreview({
    sandbox_run_id: sandboxRunId,
    settlement_amount_preview: 100.00,
    settlement_currency: 'USD',
    printhouse_payout_preview: 80.00,
    platform_fee_preview: 20.00,
    created_by: 'e2e',
  });
  assert(settlement.payoutPreviewOnly === true, 'E2E: settlement is preview only');
  assert(settlement.payoutExecutionEnabled === false, 'E2E: payout execution disabled in settlement');

  // Printhouse confirmation
  const confirmation = await svc.submitPrinthouseCommercialConfirmation({
    sandbox_run_id: sandboxRunId,
    participant_id: 'e2e-participant-125',
    confirmation_status: 'CONFIRMED',
    confirmation_notes: 'E2E test confirmation',
    confirmed_by: 'e2e',
  });
  assert(confirmation.confirmation.confirmation_id, 'E2E: confirmation created');
  assert(confirmation.confirmation.confirmation_status === 'CONFIRMED', 'E2E: confirmed');

  // Record finding
  const finding = await svc.recordCommercialFinding({
    sandbox_run_id: sandboxRunId,
    finding_type: 'OBSERVATION',
    blocks_commercial: false,
    severity: 'LOW',
    summary: 'E2E test finding',
    created_by: 'e2e',
  });
  assert(finding.finding.finding_id, 'E2E: finding created');
  const findingId = finding.finding.finding_id;

  // Resolve finding
  const resolved = await svc.resolveCommercialFinding({ finding_id: findingId, resolved_by: 'e2e' });
  assert(resolved.finding.finding_status === 'RESOLVED', 'E2E: finding resolved');

  // Audit timeline
  const timeline = await svc.getCommercialAuditTimeline({ sandbox_run_id: sandboxRunId });
  assert(timeline.audit_timeline.length > 0, 'E2E: audit timeline has events');

  // Evidence pack
  const evidence = await svc.buildCommercialEvidencePack({ sandbox_run_id: sandboxRunId });
  assert(evidence.evidence_pack.evidence_pack_id, 'E2E: evidence pack created');
  assert(evidence.evidence_pack.integrity_hash, 'E2E: evidence has integrity hash');
  assert(evidence.evidence_pack.evidence_schema_version === '125.0', 'E2E: evidence schema version 125.0');
  assert(evidence.evidence_pack.redaction_classification === 'INTERNAL_ONLY', 'E2E: redaction classification');
  assert(evidence.evidence_pack.invoice_summary.all_preview_only === true, 'E2E: all invoices preview only');
  assert(evidence.evidence_pack.invoice_summary.none_issued === true, 'E2E: no invoices issued');
  assert(evidence.evidence_pack.payment_simulation_summary.all_simulation_only === true, 'E2E: all payments simulation only');
  assert(evidence.evidence_pack.payment_simulation_summary.none_executed === true, 'E2E: no payments executed');
  assert(evidence.evidence_pack.settlement_summary.all_preview_only === true, 'E2E: all settlements preview only');
  assert(evidence.evidence_pack.settlement_summary.none_executed === true, 'E2E: no settlements executed');

  // Check redacted fields
  const ep = evidence.evidence_pack;
  assert(ep.redacted_fields.includes('internal_customer_reference'), 'E2E: redacted internal_customer_reference');
  assert(ep.redacted_fields.includes('raw_customer_data'), 'E2E: redacted raw_customer_data');
  assert(ep.redacted_fields.includes('secrets'), 'E2E: redacted secrets');
  assert(ep.redacted_fields.includes('raw_payment_credentials'), 'E2E: redacted raw_payment_credentials');
  assert(ep.redacted_fields.includes('raw_provider_keys'), 'E2E: redacted raw_provider_keys');
  assert(ep.redacted_fields.includes('raw_bank_account_data'), 'E2E: redacted raw_bank_account_data');
  assert(!ep.internal_customer_reference, 'E2E: no internal_customer_reference in evidence');
  assert(!ep.raw_customer_data, 'E2E: no raw_customer_data in evidence');
  assert(!ep.secrets, 'E2E: no secrets in evidence');
  assert(!ep.raw_payment_credentials, 'E2E: no raw_payment_credentials in evidence');

  // Safety invariants in evidence
  assert(ep.safety_invariants.paymentExecutionEnabled === false, 'E2E: evidence safety paymentExecution=false');
  assert(ep.safety_invariants.refundExecutionEnabled === false, 'E2E: evidence safety refundExecution=false');
  assert(ep.safety_invariants.payoutExecutionEnabled === false, 'E2E: evidence safety payoutExecution=false');
  assert(ep.safety_invariants.invoiceIssued === false, 'E2E: evidence safety invoiceIssued=false');
  assert(ep.safety_invariants.fullPublicEnabled === false, 'E2E: evidence safety fullPublic=false');
  assert(ep.safety_invariants.openMarketplaceAccessEnabled === false, 'E2E: evidence safety openMarketplace=false');

  console.log(`\n=== Phase 125D Results: PASS ${passed} | FAIL ${failed} ===`);
  if (failed > 0) process.exit(1);
})().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
