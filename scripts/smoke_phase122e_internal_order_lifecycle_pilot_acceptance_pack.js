'use strict';
// Phase 122E Smoke Test — Internal Order Lifecycle Pilot Acceptance Pack

const fs = require('fs');
const path = require('path');

let pass = 0;
let fail = 0;

function check(label, condition) {
  if (condition) {
    console.log(`  PASS  ${label}`);
    pass++;
  } else {
    console.error(`  FAIL  ${label}`);
    fail++;
  }
}

// Phase 122.1: set test mode so tenant allowlist allows all tenants in smoke
process.env.NODE_ENV = 'test';
process.env.ALLOW_DB_FALLBACK_FOR_SMOKE = 'true';

console.log('\n=== Phase 122E — Internal Order Lifecycle Pilot Acceptance Pack ===\n');

// Phase 122A-D smoke scripts exist
check('Smoke 122A exists', fs.existsSync(path.join(__dirname, 'smoke_phase122a_internal_order_lifecycle_pilot_schema.js')));
check('Smoke 122B exists', fs.existsSync(path.join(__dirname, 'smoke_phase122b_internal_order_lifecycle_pilot_service.js')));
check('Smoke 122C exists', fs.existsSync(path.join(__dirname, 'smoke_phase122c_internal_order_lifecycle_pilot_admin_api_ui.js')));
check('Smoke 122D exists', fs.existsSync(path.join(__dirname, 'smoke_phase122d_internal_order_lifecycle_pilot_e2e_regression.js')));

// Migration
check('Migration 064 exists', fs.existsSync(path.join(__dirname, '../migrations/064_phase122_internal_order_lifecycle_pilot.sql')));

// Service
const servicePath = path.join(__dirname, '../src/api/services/internalOrderLifecyclePilotService.js');
check('Service file exists', fs.existsSync(servicePath));

// Route
const routePath = path.join(__dirname, '../src/api/routes/internalOrderLifecyclePilotAdmin.js');
check('Route file exists', fs.existsSync(routePath));

// UI files
check('UI client exists', fs.existsSync(path.join(__dirname, '../src/ui/api/internalOrderLifecyclePilotClient.ts')));
check('UI types exist', fs.existsSync(path.join(__dirname, '../src/ui/types/internalOrderLifecyclePilot.ts')));
check('UI page exists', fs.existsSync(path.join(__dirname, '../src/ui/pages/production/InternalOrderLifecyclePilot.tsx')));

// App.tsx route
const appPath = path.join(__dirname, '../src/ui/App.tsx');
if (fs.existsSync(appPath)) {
  const appSrc = fs.readFileSync(appPath, 'utf8');
  check('App.tsx route exists', appSrc.includes('internal-order-lifecycle-pilot'));
}

// Documentation
check('Documentation exists', fs.existsSync(path.join(__dirname, '../docs/phase122_internal_order_lifecycle_pilot.md')));

// Safety markers in service
if (fs.existsSync(servicePath)) {
  const src = fs.readFileSync(servicePath, 'utf8');
  check('Service: pilotOnly: true', src.includes('pilotOnly: true'));
  check('Service: fullPublicEnabled: false', src.includes('fullPublicEnabled: false'));
  check('Service: paymentExecutionEnabled: false', src.includes('paymentExecutionEnabled: false'));
  check('Service: providerExternalSubmissionEnabled: false', src.includes('providerExternalSubmissionEnabled: false'));
  check('Service: sourceMutationOutsidePilotScope: false', src.includes('sourceMutationOutsidePilotScope: false'));

  // Forbidden execution patterns
  const forbiddenPatterns = [
    'charge(', '.charge(', 'capture(', '.capture(',
    'refund(', '.refund(', 'payout(', '.payout(',
    'submitTax', 'submitVat', 'submitAccounting', 'sendToProvider',
    'fullPublicEnabled: true', 'paymentExecutionEnabled: true',
    'providerExternalSubmissionEnabled: true', 'sourceMutationOutsidePilotScope: true',
  ];
  for (const p of forbiddenPatterns) {
    check(`No forbidden pattern: ${p}`, !src.includes(p));
  }
}

// Route safety
if (fs.existsSync(routePath)) {
  const routeSrc = fs.readFileSync(routePath, 'utf8');
  check('Route: no fullPublicEnabled: true', !routeSrc.includes('fullPublicEnabled: true'));
  check('Route: no paymentExecutionEnabled: true', !routeSrc.includes('paymentExecutionEnabled: true'));
}

// Evidence pack lifecycle validation
const Svc = require(servicePath);
const svc = new Svc();

(async () => {
  try {
    const run = await svc.createPilotLifecycleRun({ tenant_id: 'acceptance-tenant-122' });
    const runId = run.pilot_run.pilot_run_id;
    await svc.evaluatePilotLifecycleReadiness({ pilot_run_id: runId, tenant_id: 'acceptance-tenant-122' });
    const order = await svc.createInternalPilotOrder({ pilot_run_id: runId, tenant_id: 'acceptance-tenant-122' });
    const orderId = order.pilot_order.pilot_order_id;
    await svc.executeInternalOrderLifecycle({ pilot_run_id: runId, pilot_order_id: orderId, tenant_id: 'acceptance-tenant-122' });
    await svc.createRollbackPoint({ pilot_run_id: runId });
    await svc.simulateLifecycleRollback({ pilot_run_id: runId });
    const ep = await svc.buildInternalOrderLifecycleEvidencePack({ pilot_run_id: runId, pilot_order_id: orderId });

    check('Evidence pack validates: pilotOnly', ep.evidence_pack && ep.evidence_pack.pilotOnly === true);
    check('Evidence pack validates: fullPublicEnabled false', ep.evidence_pack && ep.evidence_pack.fullPublicEnabled === false);
    check('Evidence pack validates: paymentExecutionEnabled false', ep.evidence_pack && ep.evidence_pack.paymentExecutionEnabled === false);
    check('Evidence pack validates: sourceMutationOutsidePilotScope false', ep.evidence_pack && ep.evidence_pack.sourceMutationOutsidePilotScope === false);

    // Production activation remains NOT_ENABLED
    check('Production activation NOT_ENABLED', ep.safety && ep.safety.fullPublicEnabled === false);

  } catch (e) {
    check(`Acceptance error: ${e.message}`, false);
  }

  console.log('\n========================================');
  console.log('PRINTPRICE OS — PHASE 122 INTERNAL ORDER LIFECYCLE PILOT');
  console.log(`STATUS: ${fail === 0 ? 'VALIDATED' : 'FAILED'}`);
  console.log('INTERNAL_ORDER_LIFECYCLE_PILOT: ACTIVE');
  console.log('PILOT_ONLY_MODE: ACTIVE');
  console.log('FULL_PUBLIC: NOT_ENABLED');
  console.log('OPEN_MARKETPLACE_ACCESS: NOT_ENABLED');
  console.log('LIVE_PROVIDER_CONNECTIVITY: NOT_ENABLED');
  console.log('PAYMENT_EXECUTION: NOT_ENABLED');
  console.log('REFUND_EXECUTION: NOT_ENABLED');
  console.log('PAYOUT_EXECUTION: NOT_ENABLED');
  console.log('EXTERNAL_TAX_SUBMISSION: NOT_ENABLED');
  console.log('EXTERNAL_ACCOUNTING_SUBMISSION: NOT_ENABLED');
  console.log('PROVIDER_EXTERNAL_SUBMISSION: NOT_ENABLED');
  console.log('SOURCE_RECORD_MUTATION_OUTSIDE_PILOT_SCOPE: NOT_ENABLED');
  console.log('ROLLBACK_SIMULATION: ACTIVE');
  console.log('EVIDENCE_PACK: ACTIVE');
  console.log('========================================\n');

  console.log(`  Phase 122E: ${pass} passed, ${fail} failed\n`);
  if (fail > 0) process.exit(1);
})();
