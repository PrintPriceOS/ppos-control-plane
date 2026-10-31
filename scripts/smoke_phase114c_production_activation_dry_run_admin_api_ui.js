'use strict';

const fs = require('fs');
const path = require('path');

let PASS = 0, FAIL = 0;

function assert(condition, label) {
  if (condition) { PASS++; console.log(`  ✅  [PASS] ${label}`); }
  else { FAIL++; console.error(`  ❌  [FAIL] ${label}`); }
  return condition;
}

const ROOT = path.resolve(__dirname, '..');

function exists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

function src(relPath) {
  try { return fs.readFileSync(path.join(ROOT, relPath), 'utf-8'); }
  catch (_) { return ''; }
}

function has(relPath, ...patterns) {
  const content = src(relPath);
  return patterns.every(p => content.includes(p));
}

function notHas(relPath, ...patterns) {
  const content = src(relPath);
  return patterns.every(p => !content.includes(p));
}

async function run() {
  console.log('\n━━━ Phase 114C — Controlled Production Activation Dry Run Admin API & UI Smoke ━━━\n');

  // ── 1. Route file ────────────────────────────────────────────────────────────
  console.log('[1] Route file existence');
  const routeRel = 'src/api/routes/financialOperationsProductionActivationDryRunAdmin.js';
  assert(exists(routeRel), 'ROUTE_1: Route file exists');

  console.log('\n[2] Route endpoints');
  assert(has(routeRel, "router.get('/readiness'"), "ROUTE_ENDPOINT_1: GET /readiness");
  assert(has(routeRel, "router.post('/create'"), "ROUTE_ENDPOINT_2: POST /create");
  assert(has(routeRel, "router.post('/execute'"), "ROUTE_ENDPOINT_3: POST /execute");
  assert(has(routeRel, "router.post('/simulate-rollback'"), "ROUTE_ENDPOINT_4: POST /simulate-rollback");
  assert(has(routeRel, "router.get('/steps'"), "ROUTE_ENDPOINT_5: GET /steps");
  assert(has(routeRel, "router.get('/audit-timeline'"), "ROUTE_ENDPOINT_6: GET /audit-timeline");
  assert(has(routeRel, "router.get('/evidence-pack'"), "ROUTE_ENDPOINT_7: GET /evidence-pack");

  console.log('\n[3] Route safety markers');
  assert(has(routeRel, 'dryRunOnly: true'), "ROUTE_SAFETY_1: dryRunOnly: true");
  assert(has(routeRel, 'reviewOnly: true'), "ROUTE_SAFETY_2: reviewOnly: true");
  assert(has(routeRel, 'externalSubmission: false'), "ROUTE_SAFETY_3: externalSubmission: false");
  assert(has(routeRel, 'sourceMutation: false'), "ROUTE_SAFETY_4: sourceMutation: false");
  assert(has(routeRel, 'fullPublicEnabled: false'), "ROUTE_SAFETY_5: fullPublicEnabled: false");
  assert(has(routeRel, 'liveProviderConnectivityEnabled: false'), "ROUTE_SAFETY_6: liveProviderConnectivityEnabled: false");
  assert(has(routeRel, 'paymentExecutionEnabled: false'), "ROUTE_SAFETY_7: paymentExecutionEnabled: false");
  assert(has(routeRel, 'refundExecutionEnabled: false'), "ROUTE_SAFETY_8: refundExecutionEnabled: false");
  assert(has(routeRel, 'payoutExecutionEnabled: false'), "ROUTE_SAFETY_9: payoutExecutionEnabled: false");

  console.log('\n[4] Route service calls');
  assert(has(routeRel, 'financialOperationsProductionActivationDryRunService'), "ROUTE_SVC_1: Requires service");
  assert(has(routeRel, 'evaluateDryRunReadiness'), "ROUTE_SVC_2: calls evaluateDryRunReadiness");
  assert(has(routeRel, 'createDryRun'), "ROUTE_SVC_3: calls createDryRun");
  assert(has(routeRel, 'executeDryRun'), "ROUTE_SVC_4: calls executeDryRun");
  assert(has(routeRel, 'simulateRollback'), "ROUTE_SVC_5: calls simulateRollback");
  assert(has(routeRel, 'listDryRunSteps'), "ROUTE_SVC_6: calls listDryRunSteps");
  assert(has(routeRel, 'getDryRunAuditTimeline'), "ROUTE_SVC_7: calls getDryRunAuditTimeline");
  assert(has(routeRel, 'buildDryRunEvidencePack'), "ROUTE_SVC_8: calls buildDryRunEvidencePack");

  console.log('\n[5] Route forbidden pattern scan');
  const forbidden = ['charge(', 'refund(', 'payout(', 'capture(', 'submitTax',
    'externalSubmission: true', 'sourceMutation: true',
    'fullPublicEnabled: true', 'paymentExecutionEnabled: true', 'liveProviderConnectivityEnabled: true'];
  for (const f of forbidden) {
    assert(notHas(routeRel, f), `ROUTE_NO_FORBIDDEN: No "${f}"`);
  }

  // ── 2. admin.js registration ─────────────────────────────────────────────────
  console.log('\n[6] admin.js registration');
  const adminRel = 'src/api/routes/admin.js';
  assert(has(adminRel, 'financialOperationsProductionActivationDryRunAdmin'), "ADMIN_1: admin.js imports dry-run router");
  assert(has(adminRel, '/financials/activation-dry-run'), "ADMIN_2: admin.js mounts /financials/activation-dry-run");

  // ── 3. UI types ───────────────────────────────────────────────────────────────
  console.log('\n[7] UI types file');
  const typesRel = 'src/ui/types/financialOperationsProductionActivationDryRun.ts';
  assert(exists(typesRel), "TYPES_1: UI types file exists");
  assert(has(typesRel, 'DryRunSafetyMarkers'), "TYPES_2: DryRunSafetyMarkers exported");
  assert(has(typesRel, 'ProductionActivationDryRun'), "TYPES_3: ProductionActivationDryRun exported");
  assert(has(typesRel, 'DryRunStep'), "TYPES_4: DryRunStep exported");
  assert(has(typesRel, 'DryRunAuditEvent'), "TYPES_5: DryRunAuditEvent exported");
  assert(has(typesRel, 'DryRunEvidencePack'), "TYPES_6: DryRunEvidencePack exported");
  assert(has(typesRel, 'RollbackSimulation'), "TYPES_7: RollbackSimulation exported");
  assert(has(typesRel, 'DryRunReadinessResult'), "TYPES_8: DryRunReadinessResult exported");

  // ── 4. UI client ──────────────────────────────────────────────────────────────
  console.log('\n[8] UI client file');
  const clientRel = 'src/ui/api/financialOperationsProductionActivationDryRunClient.ts';
  assert(exists(clientRel), "CLIENT_1: UI client file exists");
  assert(has(clientRel, 'getProductionActivationDryRunReadiness'), "CLIENT_2: getProductionActivationDryRunReadiness");
  assert(has(clientRel, 'createProductionActivationDryRun'), "CLIENT_3: createProductionActivationDryRun");
  assert(has(clientRel, 'executeProductionActivationDryRun'), "CLIENT_4: executeProductionActivationDryRun");
  assert(has(clientRel, 'simulateProductionActivationRollback'), "CLIENT_5: simulateProductionActivationRollback");
  assert(has(clientRel, 'getProductionActivationDryRunSteps'), "CLIENT_6: getProductionActivationDryRunSteps");
  assert(has(clientRel, 'getProductionActivationDryRunAuditTimeline'), "CLIENT_7: getProductionActivationDryRunAuditTimeline");
  assert(has(clientRel, 'getProductionActivationDryRunEvidencePack'), "CLIENT_8: getProductionActivationDryRunEvidencePack");
  assert(has(clientRel, 'activation-dry-run'), "CLIENT_9: BASE_URL points to activation-dry-run");

  // ── 5. UI page ────────────────────────────────────────────────────────────────
  console.log('\n[9] UI page file');
  const pageRel = 'src/ui/pages/financial-operations-production-activation/ProductionActivationDryRun.tsx';
  assert(exists(pageRel), "PAGE_1: UI page file exists");
  assert(has(pageRel, 'Dry-Run Readiness'), "PAGE_2: Shows readiness state");
  assert(has(pageRel, 'Gate Reference'), "PAGE_3: Shows gate reference");
  assert(has(pageRel, 'Safety Invariants'), "PAGE_4: Shows safety invariants");
  assert(has(pageRel, 'Dry Run Steps'), "PAGE_5: Shows simulated activation checklist");
  assert(has(pageRel, 'Simulate Rollback'), "PAGE_6: Shows simulated rollback action");
  assert(has(pageRel, 'Audit Timeline'), "PAGE_7: Shows audit timeline");
  assert(has(pageRel, 'Evidence Pack'), "PAGE_8: Shows evidence pack preview");
  assert(has(pageRel, 'Create Dry Run'), "PAGE_9: Shows create dry-run action");
  assert(has(pageRel, 'Execute Dry Run'), "PAGE_10: Shows execute dry-run action");
  assert(has(pageRel, 'dry-run only'), "PAGE_11: Shows dry-run-only safety messaging");
  assert(has(pageRel, 'No production activation, live provider connectivity'), "PAGE_12: Full safety notice present");
  assert(has(pageRel, 'payment_execution_enabled: false'), "PAGE_13: payment_execution_enabled false shown");
  assert(has(pageRel, 'live_provider_connectivity_enabled: false'), "PAGE_14: live_provider_connectivity_enabled false shown");

  // ── 6. App.tsx route ──────────────────────────────────────────────────────────
  console.log('\n[10] App.tsx route registration');
  const appRel = 'src/ui/App.tsx';
  assert(has(appRel, 'ProductionActivationDryRun'), "APP_1: App.tsx imports ProductionActivationDryRun");
  assert(has(appRel, '/admin/production-activation-dry-run'), "APP_2: App.tsx registers /admin/production-activation-dry-run");

  // ── 7. Runtime service validation ────────────────────────────────────────────
  console.log('\n[11] Service runtime validation');
  try {
    const DryRunService = require('../src/api/services/financialOperationsProductionActivationDryRunService');
    const svc = new DryRunService();

    const created = await svc.createDryRun({ requested_by: 'smoke_114c', gate_reference_id: 'gate_smoke_114c' });
    assert(created.dryRunOnly === true, "SVC_RUNTIME_1: createDryRun dryRunOnly: true");
    assert(created.reviewOnly === true, "SVC_RUNTIME_2: createDryRun reviewOnly: true");
    assert(created.paymentExecutionEnabled === false, "SVC_RUNTIME_3: createDryRun paymentExecutionEnabled: false");
    assert(created.externalSubmission === false, "SVC_RUNTIME_4: createDryRun externalSubmission: false");
    assert(created.sourceMutation === false, "SVC_RUNTIME_5: createDryRun sourceMutation: false");

    const dryRunId = created.dry_run_id;

    const readiness = await svc.evaluateDryRunReadiness({ dry_run_id: dryRunId });
    assert(readiness.dryRunOnly === true, "SVC_RUNTIME_6: evaluateDryRunReadiness dryRunOnly");
    assert(readiness.status === 'READY_FOR_DRY_RUN', "SVC_RUNTIME_7: evaluateDryRunReadiness READY_FOR_DRY_RUN");

    const executed = await svc.executeDryRun({ dry_run_id: dryRunId });
    assert(executed.dry_run_status === 'DRY_RUN_PASSED', "SVC_RUNTIME_8: executeDryRun DRY_RUN_PASSED");
    assert(executed.paymentExecutionEnabled === false, "SVC_RUNTIME_9: executeDryRun paymentExecutionEnabled: false");
    assert(executed.liveProviderConnectivityEnabled === false, "SVC_RUNTIME_10: executeDryRun liveProviderConnectivityEnabled: false");

    const rollback = await svc.simulateRollback({ dry_run_id: dryRunId });
    assert(rollback.rollback_simulated_only === true, "SVC_RUNTIME_11: simulateRollback rollback_simulated_only: true");
    assert(rollback.sourceMutation === false, "SVC_RUNTIME_12: simulateRollback sourceMutation: false");

    const evidence = await svc.buildDryRunEvidencePack({ dry_run_id: dryRunId });
    assert(evidence.dryRunOnly === true, "SVC_RUNTIME_13: evidence pack dryRunOnly: true");
    assert(!!evidence.safety_invariants, "SVC_RUNTIME_14: evidence pack has safety_invariants");

    const stepsRes = await svc.listDryRunSteps({ dry_run_id: dryRunId });
    assert(Array.isArray(stepsRes.steps), "SVC_RUNTIME_15: listDryRunSteps returns steps array");

    const auditRes = await svc.getDryRunAuditTimeline({ dry_run_id: dryRunId });
    assert(Array.isArray(auditRes.audit_timeline), "SVC_RUNTIME_16: getDryRunAuditTimeline returns audit_timeline array");
  } catch (err) {
    FAIL++;
    console.error(`  ❌  [FAIL] Service runtime error: ${err.message}`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Phase 114C Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (FAIL > 0) {
    console.error('\nPhase 114C: FAILED');
    process.exit(1);
  } else {
    console.log('\nPhase 114C: PASSED');
    console.log('DRY_RUN_ADMIN_API: ACTIVE');
    console.log('DRY_RUN_UI: ACTIVE');
    console.log('PRODUCTION_ACTIVATION: NOT_ENABLED');
    console.log('FULL_PUBLIC: NOT_ENABLED');
    console.log('LIVE_PROVIDER_CONNECTIVITY: NOT_ENABLED');
    console.log('PAYMENT_EXECUTION: NOT_ENABLED');
    console.log('REFUND_EXECUTION: NOT_ENABLED');
    console.log('PAYOUT_EXECUTION: NOT_ENABLED');
    console.log('SOURCE_RECORD_MUTATION: NOT_ENABLED');
  }
}

run().catch(err => {
  console.error('\n[FATAL]', err);
  process.exit(1);
});
